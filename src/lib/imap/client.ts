import { ImapFlow } from 'imapflow'

export type EtsyEmailType = 'message' | 'order' | 'refund'
export type EtsyMessageSubtype = 'new' | 'reply' | 'help'

export interface DetectedEtsyEmail {
  messageId: string
  senderName: string
  subject: string
  receivedAt: Date
  type: EtsyEmailType
  subtype?: EtsyMessageSubtype // only set when type === 'message'
  priceUsd?: number            // only set when type === 'order'
  orderId?: string             // only set when type === 'order'
  country?: string             // only set when type === 'order' and parse-able
}

// Keep old name as alias so nothing else breaks
export type DetectedEtsyMessage = DetectedEtsyEmail

export interface InboxProbe {
  total: number
  recent: { sender: string; subject: string; date: Date }[]
}

type ImapAuth =
  | { user: string; pass: string }
  | { user: string; accessToken: string }

function buildAuth(email: string, creds: { appPassword?: string; accessToken?: string }): ImapAuth {
  if (creds.accessToken) return { user: email, accessToken: creds.accessToken }
  return { user: email, pass: creds.appPassword! }
}

interface Classification {
  type: EtsyEmailType
  subtype?: EtsyMessageSubtype
}

function classifySubject(subject: string): Classification | null {
  // Help request — from conversations@mail.etsy.com when a buyer opens a Help ticket.
  // Subject variants: "X needs help with an order they placed" or "Help Request: Order #<id>"
  if (/needs help with an order/i.test(subject) || /help request:\s*order\s*#/i.test(subject)) {
    return { type: 'message', subtype: 'help' }
  }
  // Reply to an ongoing convo
  if (/^\s*Re:\s+Etsy Conversation with /i.test(subject)) {
    return { type: 'message', subtype: 'reply' }
  }
  // Brand-new convo
  if (/^\s*Etsy Conversation with /i.test(subject)) {
    return { type: 'message', subtype: 'new' }
  }
  // Refund — must come BEFORE the order check, since refund emails also contain
  // "Order #<id>" in the subject (e.g. "[$14.63, Order #4040500317] You issued a refund").
  if (/\brefund(?:ed|s|ing)?\b/i.test(subject)) {
    return { type: 'refund' }
  }
  // Orders
  if (
    /you made a sale on etsy/i.test(subject) ||
    /congrats on your first sale/i.test(subject) ||
    /\border\s*#\d+/i.test(subject)
  ) {
    return { type: 'order' }
  }
  return null
}

function extractPriceUsd(subject: string): number | undefined {
  // "[$14.63, Order #4040500317]" → 14.63
  const m = subject.match(/\$(\d+(?:\.\d{1,2})?)/)
  return m ? Number(m[1]) : undefined
}

function extractOrderId(subject: string): string | undefined {
  const m = subject.match(/Order\s*#\s*(\d+)/i)
  return m ? m[1] : undefined
}

/** Best-effort plain-text extraction from raw MIME source. */
function rawMimeToText(src: Buffer | string): string {
  const raw = typeof src === 'string' ? src : src.toString('utf8')
  return raw
    .replace(/=\r?\n/g, '') // quoted-printable soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
}

/**
 * Anchor on "Shipping address" and grab the country line — it's always the
 * last non-empty line before "Purchase Shipping Label" in Etsy order emails.
 * Returns undefined for first-sale emails (no address block) or if parsing fails.
 */
function extractCountry(plainText: string): string | undefined {
  const idx = plainText.search(/Shipping address/i)
  if (idx < 0) return undefined
  const block = plainText.slice(idx, idx + 800)
  const m = block.match(/\n\s*([A-Z][A-Za-z .'\-]{2,40})\s*\n[\s\S]{0,40}?Purchase Shipping Label/)
  return m?.[1]?.trim()
}

/**
 * Connects once and fetches both customer messages and order notifications since `since`.
 */
export async function fetchNewEtsyEmails(
  email: string,
  creds: { appPassword?: string; accessToken?: string },
  since: Date
): Promise<DetectedEtsyEmail[]> {
  const client = new ImapFlow({
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: buildAuth(email, creds),
    logger: false,
  })

  await client.connect()
  const results: DetectedEtsyEmail[] = []

  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      // Fetch all emails since date — classify locally (avoids two round-trips)
      const uids = await client.search({ since })
      if (!uids || !uids.length) return results

      interface Staged {
        uid: number
        envelope: { subject: string; messageId: string; fromName: string; date: Date }
        type: EtsyEmailType
        subtype?: EtsyMessageSubtype
      }
      const staged: Staged[] = []

      // Pass 1: envelope scan + classification
      for await (const msg of client.fetch(uids as number[], { envelope: true })) {
        if (!msg.envelope) continue
        const subject = msg.envelope.subject ?? ''
        const cls = classifySubject(subject)
        if (!cls) continue

        const from = msg.envelope.from?.[0]
        staged.push({
          uid: msg.uid,
          envelope: {
            subject,
            messageId: msg.envelope.messageId || `imap-uid-${email}-${msg.uid}`,
            fromName: from?.name || from?.address || 'Unknown',
            date: msg.envelope.date ?? new Date(),
          },
          type: cls.type,
          subtype: cls.subtype,
        })
      }

      // Pass 2: for orders/refunds, fetch source to extract country (orders only)
      for (const s of staged) {
        if (s.type === 'order') {
          let country: string | undefined
          try {
            const one = await client.fetchOne(String(s.uid), { source: true }, { uid: true })
            if (one && one.source) country = extractCountry(rawMimeToText(one.source))
          } catch {
            // non-fatal — country stays undefined
          }
          results.push({
            messageId: s.envelope.messageId,
            senderName: s.envelope.fromName,
            subject: s.envelope.subject,
            receivedAt: s.envelope.date,
            type: 'order',
            priceUsd: extractPriceUsd(s.envelope.subject),
            orderId: extractOrderId(s.envelope.subject),
            country,
          })
        } else if (s.type === 'refund') {
          results.push({
            messageId: s.envelope.messageId,
            senderName: s.envelope.fromName,
            subject: s.envelope.subject,
            receivedAt: s.envelope.date,
            type: 'refund',
            priceUsd: extractPriceUsd(s.envelope.subject),
            orderId: extractOrderId(s.envelope.subject),
          })
        } else {
          results.push({
            messageId: s.envelope.messageId,
            senderName: s.envelope.fromName,
            subject: s.envelope.subject,
            receivedAt: s.envelope.date,
            type: 'message',
            subtype: s.subtype,
          })
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return results
}

// Keep old export name pointing to the new function for backwards compat
export async function fetchNewEtsyMessages(
  email: string,
  creds: { appPassword?: string; accessToken?: string },
  since: Date
): Promise<DetectedEtsyEmail[]> {
  return fetchNewEtsyEmails(email, creds, since)
}

/**
 * Probe inbox for connection testing — returns total count + last 5 emails.
 */
export async function probeInbox(
  email: string,
  creds: { appPassword?: string; accessToken?: string }
): Promise<InboxProbe> {
  const client = new ImapFlow({
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: buildAuth(email, creds),
    logger: false,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const status = await client.status('INBOX', { messages: true })
      const total = status.messages ?? 0
      const recent: InboxProbe['recent'] = []

      if (total > 0) {
        const start = Math.max(1, total - 4)
        for await (const msg of client.fetch(`${start}:${total}`, { envelope: true })) {
          if (!msg.envelope) continue
          const from = msg.envelope.from?.[0]
          recent.push({
            sender: from?.name || from?.address || 'Unknown',
            subject: msg.envelope.subject ?? '(no subject)',
            date: msg.envelope.date ?? new Date(),
          })
        }
        recent.reverse()
      }

      return { total, recent }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}
