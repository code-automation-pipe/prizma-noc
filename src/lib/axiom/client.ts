const AXIOM_TOKEN = process.env.AXIOM_TOKEN!
export const DATASET = process.env.AXIOM_DATASET ?? 'etsy-monitor'

/**
 * Ingest one or more events into Axiom.
 * Each event is a plain object; _time is set to now() if omitted.
 */
export async function ingestEvents(events: Record<string, unknown>[]): Promise<void> {
  if (!AXIOM_TOKEN) {
    console.warn('AXIOM_TOKEN not set — skipping event ingest')
    return
  }
  const res = await fetch(`https://api.axiom.co/v1/datasets/${DATASET}/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AXIOM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(events),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`Axiom ingest failed: ${res.status} ${text}`)
  }
}

export interface AxiomQueryResult {
  matches?: unknown[]
  buckets?: {
    totals?: unknown[]
    series?: unknown[]
  }
  status?: {
    rowsExamined: number
    rowsMatched: number
  }
}

/**
 * Run an APL query against Axiom and return the raw result.
 * Use normalizeAxiomResult() to extract rows in a consistent format.
 */
export async function queryAxiom(apl: string): Promise<AxiomQueryResult> {
  if (!AXIOM_TOKEN) {
    console.warn('AXIOM_TOKEN not set — returning empty result')
    return {}
  }
  const res = await fetch('https://api.axiom.co/v1/datasets/_apl?format=tabular', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AXIOM_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apl }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Axiom query failed: ${res.status} ${text}`)
  }
  return res.json()
}

/**
 * Normalize an Axiom query result into a flat array of row objects.
 * Handles both matches[] (non-aggregated) and buckets (summarize) responses.
 */
export function normalizeAxiomResult(result: AxiomQueryResult): Record<string, unknown>[] {
  // tabular format with ?format=tabular returns { tables: [{columns, fields, ...}] }
  // But we'll handle both shapes just in case
  const r = result as Record<string, unknown>
  if (Array.isArray(r['tables'])) {
    const tables = r['tables'] as Array<{ columns: unknown[][]; fields: Array<{ name: string }> }>
    if (!tables.length || !tables[0].columns?.length) return []
    const { fields, columns } = tables[0]
    const numRows = columns[0].length
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < numRows; i++) {
      const row: Record<string, unknown> = {}
      fields.forEach((f, colIdx) => {
        row[f.name] = columns[colIdx][i]
      })
      rows.push(row)
    }
    return rows
  }
  if (Array.isArray(result.matches)) {
    return result.matches as Record<string, unknown>[]
  }
  return []
}
