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
    const apl = `
['${DATASET}']
| where type == 'message_received'
| where _time > ago(${days}d)
| summarize message_count = count() by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    return Response.json(normalizeAxiomResult(result))
  } catch (err) {
    console.error('[charts/messages]', err)
    return Response.json([])
  }
}
