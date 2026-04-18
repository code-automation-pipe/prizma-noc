import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const revalidate = 300

export async function GET() {
  try {
    // Each cron run logs all 29 days again — take max per date to deduplicate
    const apl = `
['${DATASET}']
| where type == 'oxylabs_usage'
| where _time > ago(60d)
| summarize requests = max(requests_consumed), traffic_gb = max(traffic_consumed_gb) by date
| order by date asc
    `.trim()

    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)

    return Response.json(rows)
  } catch (err) {
    console.error('[charts/oxylabs]', err)
    return Response.json([], { status: 200 })
  }
}
