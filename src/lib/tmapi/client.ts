// src/lib/tmapi/client.ts
// Auth modes by domain:
//   console.tmapi.io  → Authorization: Bearer <JWT>
//   api.tmapi.top/io  → ?apiToken=<JWT> (query param)

import https from 'node:https'

export interface TmapiBalance {
  balance: number
  raw: unknown
}

interface FetchLike {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}

/** HTTPS GET bypassing SSL cert validation (api.tmapi.top has a mismatched cert) */
function httpsGetInsecure(url: string, headers?: Record<string, string>): Promise<FetchLike> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false })
    const u = new URL(url)
    const req = https.get(
      { hostname: u.hostname, port: Number(u.port) || 443, path: u.pathname + u.search, agent, headers },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          resolve({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) })
        })
      },
    )
    req.on('error', reject)
  })
}

export async function fetchTmapiBalance(): Promise<TmapiBalance | null> {
  const apiKey = process.env.TMAPI_API_KEY
  if (!apiKey) {
    console.warn('[tmapi] TMAPI_API_KEY not set — skipping')
    return null
  }

  const endpoint = process.env.TMAPI_ENDPOINT
  if (!endpoint) {
    console.warn('[tmapi] TMAPI_ENDPOINT not set — skipping (set it to the URL from DevTools)')
    return null
  }

  // console.tmapi.io uses Bearer auth; api.tmapi.top uses ?apiToken= query param
  const isConsole = endpoint.includes('console.tmapi')

  let res: FetchLike
  try {
    if (isConsole) {
      res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } else if (endpoint.includes('api.tmapi.top')) {
      // SSL bypass + query param auth
      const url = new URL(endpoint)
      url.searchParams.set('apiToken', apiKey)
      res = await httpsGetInsecure(url.toString())
    } else {
      // api.tmapi.io or other — query param auth, standard fetch
      const url = new URL(endpoint)
      url.searchParams.set('apiToken', apiKey)
      res = await fetch(url.toString())
    }
  } catch (err) {
    console.error('[tmapi] fetch error:', err)
    return null
  }

  const body = await res.text()

  if (!res.ok) {
    console.error(`[tmapi] ${res.status} from ${endpoint} — body: ${body.slice(0, 300)}`)
    return null
  }

  console.log(`[tmapi] ${res.status} response:`, body.slice(0, 500))

  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    console.error('[tmapi] response is not JSON:', body.slice(0, 200))
    return null
  }

  const balance = extractBalance(data)
  console.log(`[tmapi] extracted balance: ${balance}`)
  return { balance, raw: data }
}

function extractBalance(data: unknown): number {
  const d = data as Record<string, unknown>

  // Handle: { data: "2012" } or { data: 2012 } — value is a primitive, not an object
  if (d?.data !== null && d?.data !== undefined && typeof d.data !== 'object') {
    const v = Number(d.data)
    if (!isNaN(v)) return v
  }
  if (d?.result !== null && d?.result !== undefined && typeof d.result !== 'object') {
    const v = Number(d.result)
    if (!isNaN(v)) return v
  }

  // Unwrap common envelope shapes: { data: {...} } or { result: {...} }
  const inner = (d?.data ?? d?.result ?? d) as Record<string, unknown>

  // Usage/subscription shape: { balance, credits, remaining, quota_remaining, amount }
  // Also check nested: { data: { balance } } etc.
  const candidates = [
    inner?.balance,
    inner?.credits,
    inner?.credit,
    inner?.remaining,
    inner?.quota_remaining,
    inner?.remaining_balance,
    inner?.amount,
    inner?.available,
    d?.balance,
    d?.credits,
    d?.remaining,
  ]

  for (const v of candidates) {
    if (v !== undefined && v !== null && !isNaN(Number(v))) {
      return Number(v)
    }
  }

  return 0
}
