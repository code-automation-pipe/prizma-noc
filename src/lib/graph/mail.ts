export interface DetectedEtsyMessage {
  messageId: string
  senderName: string
  subject: string
  receivedAt: Date
}

interface GraphMessage {
  id: string
  subject: string
  from: {
    emailAddress: {
      name: string
      address: string
    }
  }
  receivedDateTime: string
  bodyPreview: string // plain-text first 255 chars — more reliable than HTML body for string matching
}

/**
 * Returns true if the email looks like an Etsy customer message notification.
 * Subject pattern: "Re: Etsy Conversation with <name>"
 * Body pattern: contains "sent you a message"
 */
function isEtsyConversationEmail(msg: GraphMessage): boolean {
  return (
    /Re:\s+Etsy Conversation with .+/i.test(msg.subject) &&
    msg.bodyPreview.toLowerCase().includes('sent you a message')
  )
}

/**
 * Fetches emails received since `since` from the given Outlook inbox via Microsoft Graph.
 * Returns only those that match the Etsy message notification pattern.
 *
 * Requires the Graph token to have Mail.Read application permission.
 */
export async function fetchNewEtsyMessages(
  token: string,
  email: string,
  since: Date
): Promise<DetectedEtsyMessage[]> {
  const isoSince = since.toISOString()
  const filter = encodeURIComponent(`receivedDateTime ge ${isoSince}`)
  const select = 'id,subject,from,receivedDateTime,bodyPreview'
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/mailFolders/Inbox/messages?$filter=${filter}&$select=${select}&$top=50&$orderby=receivedDateTime+desc`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 60)
    console.warn(`Graph API rate-limited for ${email}. Retry after ${retryAfter}s`)
    return []
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph API error for ${email}: ${res.status} ${text}`)
  }

  const data: { value: GraphMessage[] } = await res.json()

  return data.value
    .filter(isEtsyConversationEmail)
    .map((msg) => ({
      messageId: msg.id,
      senderName: msg.from.emailAddress.name || msg.from.emailAddress.address,
      subject: msg.subject,
      receivedAt: new Date(msg.receivedDateTime),
    }))
}
