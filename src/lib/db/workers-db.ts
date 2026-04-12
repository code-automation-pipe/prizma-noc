import { neon } from '@neondatabase/serverless'

const workersSQL = neon(process.env.WORKERS_DATABASE_URL!)

export interface DraftCount {
  shop_id: number
  draft_count: number
}

/**
 * Reads draft counts from the workers-site-etsy Neon DB.
 * Drafts = all product_workflow rows where status != 'UPLOADED'.
 * NOTE: COUNT(*) returns BigInt from Neon — always cast with Number().
 */
export async function getDraftCountsPerShop(): Promise<DraftCount[]> {
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

/**
 * Returns count of products uploaded (published) today per shop.
 * Uses updated_at as the publish timestamp.
 */
export async function getPublishedTodayPerShop(): Promise<DraftCount[]> {
  const rows = await workersSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM product_workflow
    WHERE status = 'UPLOADED'
      AND updated_at >= NOW() - INTERVAL '24 hours'
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}
