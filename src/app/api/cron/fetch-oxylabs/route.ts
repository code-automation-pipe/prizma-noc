export const runtime = 'nodejs'
export const maxDuration = 30

import { fetchOxylabsStats, getTodayRequestCount } from '@/lib/oxylabs/client'
import { logOxylabsUsage } from '@/lib/axiom/events'
import { evaluateAlerts } from '@/lib/alerts/engine'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 1. Fetch OxyLabs daily stats
  const stats = await fetchOxylabsStats()

  // 2. Log each day's stats to Axiom (idempotent — Axiom is append-only, duplicates are benign for charts)
  for (const day of stats) {
    await logOxylabsUsage({
      requests_consumed: day.requests,
      traffic_consumed_gb: day.traffic_bytes / 1e9,
      date: day.date,
    })
  }

  // 3. Store monthly request total in api_ledger so the dashboard card can display quota usage
  const todayRequests = getTodayRequestCount(stats)

  const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

  // Sum current month; fall back to most recent month that has data
  let monthlyRequests = stats
    .filter((s) => s.date.startsWith(currentMonth))
    .reduce((sum, s) => sum + s.requests, 0)

  if (monthlyRequests === 0 && stats.length > 0) {
    // Find most recent month with data
    const months = [...new Set(stats.map((s) => s.date.slice(0, 7)))].sort().reverse()
    const latestMonth = months.find((m) => stats.filter((s) => s.date.startsWith(m)).some((s) => s.requests > 0))
    if (latestMonth) {
      monthlyRequests = stats
        .filter((s) => s.date.startsWith(latestMonth))
        .reduce((sum, s) => sum + s.requests, 0)
      console.log('[oxylabs] current month has 0 requests, using latest active month:', latestMonth, '=', monthlyRequests)
    }
  }

  console.log('[oxylabs] monthly requests for', currentMonth, ':', monthlyRequests)

  await db.insert(api_ledger).values({
    service: 'oxylabs',
    entry_type: 'balance_snapshot',
    amount: String(monthlyRequests),
    note: `monthly requests ${currentMonth}, today=${todayRequests}`,
  })

  // 4. Evaluate API-related alerts using today's request count as a proxy for spend
  await evaluateAlerts({
    draftCounts: new Map(),
    storeMap: new Map(),
    unreadMessages: new Map(),
    apiBalances: new Map(), // OxyLabs has no balance endpoint
    apiDailySpend: new Map([['oxylabs', todayRequests]]),
    publishedToday: new Map(),
  })

  return new Response('OK', { status: 200 })
}
