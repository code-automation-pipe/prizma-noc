// src/lib/tmapi/client.ts

export interface TmapiBalance {
  /** USD credit balance */
  balance: number
  /** Raw response for debugging */
  raw: unknown
}

/**
 * Fetches the current TMAPI credit balance.
 *
 * Endpoint to verify: open TMAPI dashboard → Network tab → look for a
 * /balance or /user/info request and update BASE_URL + path below if needed.
 */
export async function fetchTmapiBalance(): Promise<TmapiBalance | null> {
  // Endpoint not yet confirmed — disable until correct path is known
  return null

  // eslint-disable-next-line no-unreachable
  const apiKey = process.env.TMAPI_API_KEY
  if (!apiKey) {
    console.warn('TMAPI_API_KEY not set — skipping TMAPI balance fetch')
    return null
  }

  // Try the v2 endpoint; if it 404s, check TMAPI dashboard → Network tab for the correct path
  const res = await fetch('https://api.tmapi.io/api/v2/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[tmapi] ${res.status} from ${res.url} — body: ${body.slice(0, 300)}`)
    throw new Error(`TMAPI balance API error: ${res.status}`)
  }

  const data = await res.json()
  console.log('[tmapi] raw response:', JSON.stringify(data))

  // Common response shapes: { balance: 12.34 } or { data: { balance: 12.34 } } or { credits: 12.34 }
  const balance = Number(
    data?.balance ?? data?.data?.balance ?? data?.credits ?? data?.data?.credits ?? 0
  )

  return { balance, raw: data }
}
