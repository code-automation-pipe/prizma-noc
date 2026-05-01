export const runtime = 'nodejs'

const DEFAULT_BASE = 'https://api.telegram.org'

export async function POST() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    const missing = [!token && 'TELEGRAM_BOT_TOKEN', !chatId && 'TELEGRAM_CHAT_ID']
      .filter(Boolean)
      .join(', ')
    return Response.json(
      { ok: false, error: `Missing env: ${missing}` },
      { status: 400 },
    )
  }

  // Catch the common "token has 'bot' prefix baked in" mistake — we already
  // prepend /bot in the URL, so a doubled prefix produces a silent 404.
  if (/^bot/i.test(token)) {
    return Response.json(
      {
        ok: false,
        error:
          'TELEGRAM_BOT_TOKEN starts with "bot" — strip that prefix. The token from BotFather is just <bot_id>:<hash>.',
      },
      { status: 400 },
    )
  }

  const base = (process.env.TELEGRAM_APP_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const url = `${base}/bot${token}/sendMessage`

  const text = `🧪 <b>Test ping</b> from Etsy Monitor\n${new Date().toISOString()}`

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

    const body = await res.text()
    if (!res.ok) {
      return Response.json(
        { ok: false, error: `Telegram API ${res.status}`, raw: body.slice(0, 500) },
        { status: 502 },
      )
    }
    return Response.json({ ok: true, chat_id: chatId, sent_at: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: `Network error: ${msg}` }, { status: 502 })
  }
}
