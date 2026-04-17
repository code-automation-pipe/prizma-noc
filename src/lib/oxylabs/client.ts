export interface OxylabsDayStats {
  date: string
  requests: number
  traffic_bytes: number
}

/**
 * Fetches daily usage stats from OxyLabs for the last 30 days.
 * Returns consumed requests and traffic per day.
 *
 * NOTE: OxyLabs does not expose a remaining-balance endpoint.
 * These are consumed metrics only. Compare against your plan limit to derive utilization.
 */
export async function fetchOxylabsStats(): Promise<OxylabsDayStats[]> {
  const username = process.env.OXYLABS_USERNAME!
  const password = process.env.OXYLABS_PASSWORD!

  if (!username || !password) {
    console.warn('OXYLABS_USERNAME / OXYLABS_PASSWORD not set — skipping OxyLabs fetch')
    return []
  }

  const credentials = Buffer.from(`${username}:${password}`).toString('base64')

  const res = await fetch('https://data.oxylabs.io/v2/stats?group_by=day', {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OxyLabs stats API error: ${res.status} ${text}`)
  }

  const data = await res.json()

  // The /v2/stats response wraps data in a `data` array.
  // Each entry may have different field names depending on the product.
  // We normalize to a common shape here.
  const raw: Record<string, unknown>[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.statistics)
      ? data.statistics
      : Array.isArray(data)
        ? data
        : []

  // API returns { date, products: [{ all_count, request_traffic, title, ... }] }
  // Sum across all products for each day
  return raw.map((d) => {
    const products = Array.isArray(d.products)
      ? (d.products as Record<string, unknown>[])
      : []
    const requests = products.length > 0
      ? products.reduce((sum, p) => sum + Number(p.all_count ?? 0), 0)
      : Number(d.all_count ?? d.requests ?? 0)
    const traffic_bytes = products.length > 0
      ? products.reduce((sum, p) => sum + Number(p.request_traffic ?? 0), 0)
      : Number(d.request_traffic ?? d.traffic_bytes ?? 0)
    return {
      date: String(d.date ?? d.day ?? d.period ?? ''),
      requests,
      traffic_bytes,
    }
  })
}

/**
 * Returns today's total request count from the stats array.
 */
export function getTodayRequestCount(stats: OxylabsDayStats[]): number {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const todayStat = stats.find((s) => s.date.startsWith(today))
  return todayStat?.requests ?? 0
}
