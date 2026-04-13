import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const revalidate = 300

export async function GET() {
  try {
    const apl = `
['${DATASET}']
| where type == 'products_published'
| where _time > ago(30d)
| summarize total = sum(count) by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)

    return Response.json(rows)
  } catch (err) {
    console.error('[charts/published]', err)
    return Response.json([])
  }
}
