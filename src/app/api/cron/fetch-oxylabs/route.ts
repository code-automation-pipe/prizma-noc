export const runtime = 'nodejs'
export const maxDuration = 30

import { fetchOxylabsStats, getTodayRequestCount } from '@/lib/oxylabs/client'
import { logOxylabsUsage } from '@/lib/axiom/events'
import { evaluateAlerts } from '@/lib/alerts/engine'

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

  // 3. Evaluate API-related alerts using today's request count as a proxy for spend
  const todayRequests = getTodayRequestCount(stats)

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
