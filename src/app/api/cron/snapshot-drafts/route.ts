export const runtime = 'nodejs'
export const maxDuration = 60

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { getDraftCountsPerShop, getPublishedTodayPerShop } from '@/lib/db/workers-db'
import { logDraftSnapshot, logProductsPublished } from '@/lib/axiom/events'
import { evaluateAlerts } from '@/lib/alerts/engine'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 1. Fetch draft counts and published-today from workers DB
  const [draftCounts, publishedCounts] = await Promise.all([
    getDraftCountsPerShop(),
    getPublishedTodayPerShop(),
  ])

  // 2. Fetch all stores from primary DB
  const allStores = await db.query.stores.findMany()
  const shopIdToStore = new Map(allStores.map((s) => [s.shop_id, s]))

  // 3. Update cached draft count + snapshot timestamp on each store record
  for (const dc of draftCounts) {
    const store = shopIdToStore.get(dc.shop_id)
    if (!store) continue
    await db
      .update(stores)
      .set({
        last_draft_count: dc.draft_count,
        last_draft_snapshot_at: new Date(),
      })
      .where(eq(stores.id, store.id))
  }

  // 4. Log draft snapshots to Axiom
  await logDraftSnapshot(
    draftCounts.map((d) => ({
      shop_id: d.shop_id,
      store_name: shopIdToStore.get(d.shop_id)?.name ?? `shop_${d.shop_id}`,
      draft_count: d.draft_count,
    }))
  )

  // 5. Log published-today counts to Axiom
  for (const pc of publishedCounts) {
    const store = shopIdToStore.get(pc.shop_id)
    if (!store) continue
    await logProductsPublished({
      shop_id: pc.shop_id,
      store_name: store.name,
      count: pc.draft_count, // field name reuse — this is the published count
    })
  }

  // 6. Build context for alert evaluation
  const draftMap = new Map(draftCounts.map((d) => [d.shop_id, d.draft_count]))
  const publishedMap = new Map(publishedCounts.map((p) => [p.shop_id, p.draft_count]))
  const storeMap = new Map(
    allStores.map((s) => [
      s.shop_id,
      { id: s.id, name: s.name, threshold: s.draft_alert_threshold },
    ])
  )

  await evaluateAlerts({
    draftCounts: draftMap,
    storeMap,
    unreadMessages: new Map(),
    apiBalances: new Map(),
    apiDailySpend: new Map(),
    publishedToday: publishedMap,
  })

  return new Response('OK', { status: 200 })
}
