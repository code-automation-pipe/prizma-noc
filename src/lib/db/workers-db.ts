import { neon } from '@neondatabase/serverless'

// workers-site-etsy DB — holds the `products` table (raw scrape data:
// uploaded_at, pipeline_ended_at, pipeline_cost_usd, pipeline_status, …).
// Required: throws on import if WORKERS_DATABASE_URL is unset, so misconfig
// fails loudly instead of silently zeroing every dashboard metric.
if (!process.env.WORKERS_DATABASE_URL) {
  throw new Error('WORKERS_DATABASE_URL is not set')
}
const productsSQL = neon(process.env.WORKERS_DATABASE_URL)

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
 *
 * Single-query: today + cumulative computed via FILTER aggregations to halve
 * Neon compute (one scan instead of two).
 */
export async function getPipelineSpend(): Promise<PipelineSpend> {
  const rows = await productsSQL`
    SELECT
      COALESCE(SUM(pipeline_cost_usd) FILTER (WHERE pipeline_ended_at >= NOW() - INTERVAL '24 hours'), 0)::float AS today_usd,
      COALESCE(SUM(pipeline_cost_usd), 0)::float                                                                  AS cumulative_usd,
      COALESCE(SUM(pipeline_tokens_in)  FILTER (WHERE pipeline_ended_at >= NOW() - INTERVAL '24 hours'), 0)::int  AS tokens_in,
      COALESCE(SUM(pipeline_tokens_out) FILTER (WHERE pipeline_ended_at >= NOW() - INTERVAL '24 hours'), 0)::int  AS tokens_out
    FROM products
    WHERE pipeline_cost_usd IS NOT NULL
  `

  return {
    today_usd:        Number(rows[0]?.today_usd       ?? 0),
    cumulative_usd:   Number(rows[0]?.cumulative_usd  ?? 0),
    today_tokens_in:  Number(rows[0]?.tokens_in       ?? 0),
    today_tokens_out: Number(rows[0]?.tokens_out      ?? 0),
  }
}

export interface ShopMetrics {
  shop_id: number
  published_today: number
  completed_today: number
  not_processed: number
  ready_to_process: number
  uploaded: number
}

/**
 * One-shot per-shop counts used by the dashboard. Replaces 5 separate
 * COUNT/GROUP-BY scans of the products table with a single scan that uses
 * FILTER aggregations — 5× fewer Neon round-trips on every dashboard refresh.
 */
export async function getShopMetrics(): Promise<ShopMetrics[]> {
  const rows = await productsSQL`
    SELECT
      shop_id,
      COUNT(*) FILTER (
        WHERE completed_at >= DATE_TRUNC('day', NOW())
          AND uploaded_at  >= DATE_TRUNC('day', NOW())
      )::int AS published_today,
      COUNT(*) FILTER (
        WHERE completed_at >= DATE_TRUNC('day', NOW())
      )::int AS completed_today,
      COUNT(*) FILTER (
        WHERE pipeline_status = 'none' OR pipeline_status IS NULL
      )::int AS not_processed,
      COUNT(*) FILTER (
        WHERE pipeline_status ILIKE 'completed'
      )::int AS ready_to_process,
      COUNT(*) FILTER (
        WHERE pipeline_status ILIKE 'uploaded'
      )::int AS uploaded
    FROM products
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id:          Number(r.shop_id),
    published_today:  Number(r.published_today),
    completed_today:  Number(r.completed_today),
    not_processed:    Number(r.not_processed),
    ready_to_process: Number(r.ready_to_process),
    uploaded:         Number(r.uploaded),
  }))
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
 * Rolling 24h window of products published to Etsy per shop.
 * Used by the midnight zero-publishing Telegram check — calendar-day truncation
 * would always read 0 immediately after 00:00, so we count the prior 24h instead.
 */
export async function getPublishedLast24hPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE completed_at >= NOW() - INTERVAL '24 hours'
      AND uploaded_at  >= NOW() - INTERVAL '24 hours'
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

/**
 * Returns count of products that have finished the pipeline and are sitting
 * ready to upload to Etsy per shop. pipeline_status ≈ 'completed'
 * (ILIKE so casing drift doesn't silently zero the column).
 */
export async function getReadyToProcessPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE pipeline_status ILIKE 'completed'
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

/**
 * Returns count of products that have already been uploaded to Etsy per shop.
 * pipeline_status ≈ 'Uploaded' (capital U is the actual value in the products
 * table; ILIKE keeps the count robust to future casing changes).
 */
export async function getUploadedPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE pipeline_status ILIKE 'uploaded'
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

