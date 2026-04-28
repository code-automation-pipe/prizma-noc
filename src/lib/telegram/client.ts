const DEFAULT_BASE = 'https://api.telegram.org'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Sends an HTML-formatted message to the configured Telegram chat.
 * Silently skips (logs warn) if env vars are missing — never throws.
 */
export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping send')
    return
  }

  const base = (process.env.TELEGRAM_APP_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const url = `${base}/bot${token}/sendMessage`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[telegram] send failed: ${res.status} ${body}`)
    }
  } catch (err) {
    console.error('[telegram] send error:', err)
  }
}

export interface OrderNotification {
  shopName: string
  priceUsd?: number
  country?: string
  orderId?: string
}

export async function notifyOrder(o: OrderNotification): Promise<void> {
  const parts = [`🛒 <b>New sale</b> — ${escapeHtml(o.shopName)}`]
  const meta: string[] = []
  if (typeof o.priceUsd === 'number') meta.push(`$${o.priceUsd.toFixed(2)}`)
  if (o.country) meta.push(escapeHtml(o.country))
  if (meta.length) parts.push(meta.join(' · '))
  if (o.orderId) parts.push(`Order #${escapeHtml(o.orderId)}`)
  await sendTelegram(parts.join('\n'))
}

export interface RefundNotification {
  shopName: string
  priceUsd?: number
  orderId?: string
}

export async function notifyRefund(r: RefundNotification): Promise<void> {
  const parts = [`↩️ <b>Refund issued</b> — ${escapeHtml(r.shopName)}`]
  if (typeof r.priceUsd === 'number') parts.push(`−$${r.priceUsd.toFixed(2)}`)
  if (r.orderId) parts.push(`Order #${escapeHtml(r.orderId)}`)
  await sendTelegram(parts.join('\n'))
}

export interface MessageNotification {
  shopName: string
  subtype: 'new' | 'reply' | 'help'
  senderName?: string
  subject?: string
}

const SUBTYPE_LABEL: Record<MessageNotification['subtype'], string> = {
  new: '💬 New message',
  reply: '↩️ Reply',
  help: '🆘 Help request',
}

export async function notifyMessage(m: MessageNotification): Promise<void> {
  const parts = [`${SUBTYPE_LABEL[m.subtype]} — ${escapeHtml(m.shopName)}`]
  if (m.senderName) parts.push(`From: ${escapeHtml(m.senderName)}`)
  if (m.subject) parts.push(escapeHtml(m.subject))
  await sendTelegram(parts.join('\n'))
}
