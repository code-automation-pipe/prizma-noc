import { neon } from '@neondatabase/serverless'

// products DB — raw scrape data (uploaded_at, pipeline_ended_at, pipeline_cost_usd, …)
// Same DB as DATABASE_URL; PRODUCTS_DATABASE_URL alias kept for clarity but falls back to DATABASE_URL
const productsSQL = neon((process.env.PRODUCTS_DATABASE_URL ?? process.env.DATABASE_URL)!)

export interface DraftCount {
  shop_id: number
  draft_count: number
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
 * pipeline_cost_usd already includes all pipeline inference costs.
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
 * Returns count of products published to Etsy today per shop.
 * Requires both `completed_at` and `uploaded_at` to fall on the current day.
 */
export async function getPublishedTodayPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE completed_at >= DATE_TRUNC('day', NOW())
      AND uploaded_at  >= DATE_TRUNC('day', NOW())
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

/**
 * Returns count of products that completed pipeline processing today per shop.
 */
export async function getCompletedTodayPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE completed_at >= DATE_TRUNC('day', NOW())
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

/**
 * Returns count of products that haven't been processed yet per shop.
 * "Not processed" = pipeline_status is literally 'none' or NULL.
 */
export async function getNotProcessedPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE pipeline_status = 'none' OR pipeline_status IS NULL
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

export interface PublishedDailyRow {
  shop_id: number
  day: string         // ISO date (YYYY-MM-DD) at start of day, UTC
  published_count: number
}

export interface DailySpendRow {
  day: string         // ISO date (YYYY-MM-DD)
  total_usd: number
}

/**
 * Returns daily Gemini (Google AI) spend for the last `days` calendar days,
 * sourced from products.pipeline_cost_usd grouped by pipeline_ended_at.
 * This is the same spend value used for "API Spend Today" but binned per day.
 */
export async function getGeminiDailySpend(days: number): Promise<DailySpendRow[]> {
  const safeDays = Math.min(60, Math.max(1, Math.floor(days)))
  const rows = await productsSQL`
    SELECT
      DATE_TRUNC('day', pipeline_ended_at)::date AS day,
      COALESCE(SUM(pipeline_cost_usd), 0)::float AS total_usd
    FROM products
    WHERE pipeline_ended_at >= DATE_TRUNC('day', NOW()) - (${safeDays}::int - 1) * INTERVAL '1 day'
      AND pipeline_cost_usd IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `
  return rows.map((r) => ({
    day: typeof r.day === 'string' ? r.day : new Date(r.day as Date).toISOString().slice(0, 10),
    total_usd: Number(r.total_usd),
  }))
}

/**
 * Returns daily published counts per shop for the last `days` calendar days.
 * Same predicate as `getPublishedTodayPerShop` (both completed_at and uploaded_at
 * must fall on the same day), but binned by day for trend charts.
 */
export async function getPublishedDailyPerShop(days: number): Promise<PublishedDailyRow[]> {
  const safeDays = Math.min(60, Math.max(1, Math.floor(days)))
  const rows = await productsSQL`
    SELECT
      shop_id,
      DATE_TRUNC('day', completed_at)::date AS day,
      COUNT(*)::int AS published_count
    FROM products
    WHERE completed_at >= DATE_TRUNC('day', NOW()) - (${safeDays}::int - 1) * INTERVAL '1 day'
      AND uploaded_at IS NOT NULL
      AND DATE_TRUNC('day', completed_at) = DATE_TRUNC('day', uploaded_at)
    GROUP BY shop_id, day
    ORDER BY day ASC
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    day: typeof r.day === 'string' ? r.day : new Date(r.day as Date).toISOString().slice(0, 10),
    published_count: Number(r.published_count),
  }))
}

