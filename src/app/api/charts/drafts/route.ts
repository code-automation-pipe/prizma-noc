import { type NextRequest } from 'next/server'
import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    // Use the latest snapshot per (day, store) instead of averaging — averaging
    // mixes old-cron values with new-cron values on the day of a metric change,
    // producing numbers that don't match the live table.
    const apl = `
['${DATASET}']
| where type == 'draft_snapshot'
| where _time > ago(${days}d)
| summarize arg_max(_time, draft_count) by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    return Response.json(normalizeAxiomResult(result))
  } catch (err) {
    console.error('[charts/drafts]', err)
    return Response.json([])
  }
}
