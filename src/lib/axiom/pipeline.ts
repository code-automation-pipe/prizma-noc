import { queryAxiom, normalizeAxiomResult, DATASET } from './client'

export interface PipelineItemTotals {
  completed: number
  failed: number
}

/**
 * Returns per-shop totals of worker pipeline events for the current calendar day (UTC).
 * Source: workers-site ingests `item_completed` / `item_failed` events into Axiom.
 * Shape of ingested event:
 *   { service: "workers-site", event: "item_completed" | "item_failed", shop_id: number, ... }
 *
 * Returns Map<shop_id, { completed, failed }>. Empty map on failure so the dashboard
 * degrades gracefully instead of blocking the page.
 */
export async function fetchPipelineItemsToday(): Promise<Map<number, PipelineItemTotals>> {
  const out = new Map<number, PipelineItemTotals>()
  if (!process.env.AXIOM_TOKEN) return out

  const apl =
    `['${DATASET}']` +
    ` | where _time >= startofday(now())` +
    ` | where service == "workers-site"` +
    ` | where event in ("item_completed", "item_failed")` +
    ` | summarize cnt = count() by shop_id, event`

  try {
    const result = await queryAxiom(apl)
    const rows = normalizeAxiomResult(result)
    for (const r of rows) {
      const shopId = Number(r['shop_id'])
      if (!Number.isFinite(shopId)) continue
      const event = String(r['event'] ?? '')
      const cnt = Number(r['cnt'] ?? r['count()'] ?? 0)
      const bucket = out.get(shopId) ?? { completed: 0, failed: 0 }
      if (event === 'item_completed') bucket.completed += cnt
      else if (event === 'item_failed') bucket.failed += cnt
      out.set(shopId, bucket)
    }
  } catch (err) {
    console.error('[axiom-pipeline] query failed:', err instanceof Error ? err.message : err)
  }

  return out
}
