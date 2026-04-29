import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'
import { getGeminiDailySpend } from '@/lib/db/workers-db'

export const revalidate = 300

export async function GET() {
  const [entries, geminiDaily] = await Promise.all([
    db.query.api_ledger.findMany({ orderBy: desc(api_ledger.created_at) }),
    getGeminiDailySpend(30).catch((e) => {
      console.error('[charts/api-cost] getGeminiDailySpend failed:', e)
      return []
    }),
  ])

  // Daily Google AI costs come straight from products.pipeline_cost_usd
  const dailyRows = geminiDaily.map((r) => ({
    date: r.day,
    gemini: r.total_usd,
  }))

  // Cumulative still uses the ledger (manual entries) for both services
  const dayServiceMap = new Map<string, Record<string, number>>()
  for (const e of entries) {
    if (e.entry_type !== 'spend') continue
    const day = new Date(e.created_at).toISOString().slice(0, 10)
    if (!dayServiceMap.has(day)) dayServiceMap.set(day, {})
    const dayData = dayServiceMap.get(day)!
    dayData[e.service] = (dayData[e.service] ?? 0) + Number(e.amount)
  }

  const ledgerRows: Record<string, number | string>[] = Array.from(dayServiceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, svcData]) => ({ date, ...svcData }))

  const services = ['gemini'] as const
  const runningTotals: Record<string, number> = {}
  const cumulativeRows = ledgerRows.map((row) => {
    const cum: Record<string, unknown> = { date: row.date }
    for (const s of services) {
      runningTotals[s] = (runningTotals[s] ?? 0) + (Number(row[s]) || 0)
      cum[`${s}_cumulative`] = runningTotals[s]
      cum[`${s}_daily`] = Number(row[s]) || 0
    }
    return cum
  })

  return Response.json({ daily: dailyRows, cumulative: cumulativeRows })
}
