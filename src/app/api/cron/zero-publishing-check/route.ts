export const runtime = 'nodejs'
export const maxDuration = 60

import { db } from '@/lib/db'
import { getPublishedLast24hPerShop } from '@/lib/db/workers-db'
import { evaluateAlerts } from '@/lib/alerts/engine'
import { notifyZeroPublishing } from '@/lib/telegram/client'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [allStores, publishedRows] = await Promise.all([
    db.query.stores.findMany(),
    getPublishedLast24hPerShop(),
  ])

  const publishedByShop = new Map<number, number>(
    publishedRows.map((r) => [r.shop_id, r.draft_count]),
  )

  const silent = allStores
    .filter((s) => (publishedByShop.get(s.shop_id) ?? 0) === 0)
    .map((s) => s.name)

  await notifyZeroPublishing(silent, allStores.length)

  // Mirror into the alert feed (one row per silent store per day, deduped 24h).
  await evaluateAlerts({
    draftCounts: new Map(),
    storeMap: new Map(
      allStores.map((s) => [
        s.shop_id,
        { id: s.id, name: s.name, threshold: s.draft_alert_threshold },
      ]),
    ),
    unreadMessages: new Map(),
    apiBalances: new Map(),
    apiDailySpend: new Map(),
    publishedToday: new Map(allStores.map((s) => [s.shop_id, publishedByShop.get(s.shop_id) ?? 0])),
  })

  return Response.json({
    checked: allStores.length,
    silent_stores: silent,
  })
}
