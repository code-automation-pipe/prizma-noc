import { neon } from '@neondatabase/serverless'

// product_workflow DB — pipeline status (READY / PROCESSING / QUESTION / UPLOADED)
const workersSQL = neon(process.env.WORKERS_DATABASE_URL!)

// products DB — raw scrape data (uploaded_at, pipeline_ended_at, pipeline_cost_usd, …)
const productsSQL = neon(process.env.PRODUCTS_DATABASE_URL!)

export interface DraftCount {
  shop_id: number
  draft_count: number
}

/**
 * Reads draft counts from the products table.
 * Drafts = products where uploaded_at IS NULL (not yet sent to Etsy).
 */
export async function getDraftCountsPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE uploaded_at IS NULL
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

export interface PipelineSpend {
  /** Total pipeline cost today (last 24h rolling window) */
  today_usd: number
  /** Total pipeline cost all time */
  cumulative_usd: number
  today_tokens_in: number
  today_tokens_out: number
}

/**
 * Reads pipeline spend from the products table.
 * Uses a rolling 24h window for "today" to avoid timezone/midnight issues.
 * pipeline_cost_usd already includes all costs (Gemini + Modal GPU).
 */
export async function getPipelineSpend(): Promise<PipelineSpend> {
  const [todayRows, allRows] = await Promise.all([
    productsSQL`
      SELECT
        COALESCE(SUM(pipeline_cost_usd), 0)::float   AS total_usd,
        COALESCE(SUM(pipeline_tokens_in), 0)::int    AS tokens_in,
        COALESCE(SUM(pipeline_tokens_out), 0)::int   AS tokens_out
      FROM products
      WHERE pipeline_ended_at >= NOW() - INTERVAL '24 hours'
        AND pipeline_cost_usd IS NOT NULL
    `,
    productsSQL`
      SELECT
        COALESCE(SUM(pipeline_cost_usd), 0)::float AS total_usd
      FROM products
      WHERE pipeline_cost_usd IS NOT NULL
    `,
  ])

  return {
    today_usd:       Number(todayRows[0]?.total_usd  ?? 0),
    cumulative_usd:  Number(allRows[0]?.total_usd    ?? 0),
    today_tokens_in: Number(todayRows[0]?.tokens_in  ?? 0),
    today_tokens_out:Number(todayRows[0]?.tokens_out ?? 0),
  }
}

/**
 * Returns count of products uploaded (published) to Etsy today (calendar day).
 */
export async function getPublishedTodayPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE uploaded_at >= DATE_TRUNC('day', NOW())
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

/**
 * Returns count of products from product_workflow that are not yet uploaded.
 * Status != 'UPLOADED' includes READY, PROCESSING, and QUESTION states.
 */
export async function getDraftStatePerShop(): Promise<DraftCount[]> {
  const rows = await workersSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM product_workflow
    WHERE status != 'UPLOADED'
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}
