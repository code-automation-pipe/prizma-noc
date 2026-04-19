import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'

export const revalidate = 300

export async function GET() {
  // API cost chart uses the ledger DB (not Axiom) for manual services
  const entries = await db.query.api_ledger.findMany({
    orderBy: desc(api_ledger.created_at),
  })

  // Group spend entries by day and service
  const dayServiceMap = new Map<string, Record<string, number>>()

  for (const e of entries) {
    if (e.entry_type !== 'spend') continue
    const day = new Date(e.created_at).toISOString().slice(0, 10)
    if (!dayServiceMap.has(day)) dayServiceMap.set(day, {})
    const dayData = dayServiceMap.get(day)!
    dayData[e.service] = (dayData[e.service] ?? 0) + Number(e.amount)
  }

  const rows: Record<string, number | string>[] = Array.from(dayServiceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, svcData]) => ({ date, ...svcData }))

  // Compute cumulative spend per service
  const services = ['gemini', 'tmapi'] as const
  const runningTotals: Record<string, number> = {}
  const cumulativeRows = rows.map((row) => {
    const cum: Record<string, unknown> = { date: row.date }
    for (const s of services) {
      runningTotals[s] = (runningTotals[s] ?? 0) + (Number(row[s]) || 0)
      cum[`${s}_cumulative`] = runningTotals[s]
      cum[`${s}_daily`] = Number(row[s]) || 0
    }
    return cum
  })

  return Response.json({ daily: rows, cumulative: cumulativeRows })
}
