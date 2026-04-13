import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const revalidate = 300

export async function GET() {
  try {
    const apl = `
['${DATASET}']
| where type == 'draft_snapshot'
| where _time > ago(7d)
| summarize draft_count = sum(draft_count) by bin(_time, 1h), shop_id, store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)

    return Response.json(rows)
  } catch (err) {
    console.error('[charts/drafts]', err)
    return Response.json([], { status: 200 }) // Return empty array so chart renders gracefully
  }
}
