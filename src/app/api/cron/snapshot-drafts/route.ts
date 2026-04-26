export const runtime = 'nodejs'
export const maxDuration = 60

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { getNotProcessedPerShop } from '@/lib/db/workers-db'
import { logDraftSnapshot } from '@/lib/axiom/events'
import { evaluateAlerts } from '@/lib/alerts/engine'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [allStores, notProcessedRows] = await Promise.all([
    db.query.stores.findMany(),
    getNotProcessedPerShop(),
  ])

  const draftCounts = new Map<number, number>(
    notProcessedRows.map((r) => [r.shop_id, r.draft_count]),
  )

  const now = new Date()
  await Promise.all(
    allStores.map((s) =>
      db
        .update(stores)
        .set({
          last_draft_count: draftCounts.get(s.shop_id) ?? 0,
          last_draft_snapshot_at: now,
        })
        .where(eq(stores.id, s.id)),
    ),
  )

  await logDraftSnapshot(
    allStores.map((s) => ({
      shop_id: s.shop_id,
      store_name: s.name,
      draft_count: draftCounts.get(s.shop_id) ?? 0,
    })),
  )

  const storeMap = new Map(
    allStores.map((s) => [
      s.shop_id,
      { id: s.id, name: s.name, threshold: s.draft_alert_threshold },
    ]),
  )

  await evaluateAlerts({
    draftCounts: new Map(allStores.map((s) => [s.shop_id, draftCounts.get(s.shop_id) ?? 0])),
    storeMap,
    unreadMessages: new Map(),
    apiBalances: new Map(),
    apiDailySpend: new Map(),
    publishedToday: new Map(),
  })

  return new Response('OK', { status: 200 })
}
