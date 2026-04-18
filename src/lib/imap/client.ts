import { ImapFlow } from 'imapflow'

export type EtsyEmailType = 'message' | 'order'

export interface DetectedEtsyEmail {
  messageId: string
  senderName: string
  subject: string
  receivedAt: Date
  type: EtsyEmailType
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

function classifySubject(subject: string): EtsyEmailType | null {
  if (/Re:\s+Etsy Conversation with .+/i.test(subject)) return 'message'
  if (/new order|order from|you received a new order|order confirmed/i.test(subject)) return 'order'
  return null
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

      for await (const msg of client.fetch(uids as number[], { envelope: true })) {
        if (!msg.envelope) continue
        const subject = msg.envelope.subject ?? ''
        const type = classifySubject(subject)
        if (!type) continue

        const from = msg.envelope.from?.[0]
        results.push({
          messageId: msg.envelope.messageId || `imap-uid-${email}-${msg.uid}`,
          senderName: from?.name || from?.address || 'Unknown',
          subject,
          receivedAt: msg.envelope.date ?? new Date(),
          type,
        })
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
