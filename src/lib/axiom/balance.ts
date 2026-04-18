import { queryAxiom, normalizeAxiomResult, DATASET } from './client'

export interface AxiomUsage {
  totalEvents: number
}

export interface AxiomStatusBucket {
  count: number
  last: string | null
}

export interface AxiomStatusCounts {
  completed: AxiomStatusBucket
  error: AxiomStatusBucket
  running: AxiomStatusBucket
}

export async function fetchAxiomUsage(): Promise<AxiomUsage | null> {
  if (!process.env.AXIOM_TOKEN) {
    console.warn('[axiom-balance] AXIOM_TOKEN not set — skipping')
    return null
  }

  try {
    const apl = `['${DATASET}'] | summarize event_count = count() by bin(_time, 99999d)`
    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)
    const totalEvents = rows.reduce((sum, r) => {
      const v = r['event_count'] ?? r['count()'] ?? r['_count'] ?? 0
      return sum + Number(v)
    }, 0)
    return { totalEvents }
  } catch (err) {
    console.error('[axiom-balance] query failed:', err)
    return null
  }
}

async function statusBucket(term: string): Promise<AxiomStatusBucket> {
  // Bound the query to last 30 days — unbounded search across the whole dataset
  // tends to 500 on Axiom. Use `where _time > ago(30d)` before `search`.
  const apl = `['${DATASET}'] | where _time > ago(30d) | search "${term}" | summarize cnt = count(), last = max(_time)`
  try {
    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)
    if (!rows.length) return { count: 0, last: null }
    const r = rows[0]
    return {
      count: Number(r['cnt'] ?? r['count()'] ?? 0),
      last: r['last'] ? String(r['last']) : null,
    }
  } catch (err) {
    console.error(`[axiom-status] ${term} failed:`, err instanceof Error ? err.message : err)
    return { count: 0, last: null }
  }
}

export async function fetchAxiomStatusCounts(): Promise<AxiomStatusCounts | null> {
  if (!process.env.AXIOM_TOKEN) return null
  const [completed, error, running] = await Promise.all([
    statusBucket('Completed'),
    statusBucket('Error'),
    statusBucket('Running'),
  ])
  return { completed, error, running }
}
