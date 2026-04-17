export const runtime = 'nodejs'
export const maxDuration = 60

import { db } from '@/lib/db'
import { logDraftSnapshot } from '@/lib/axiom/events'
import { evaluateAlerts } from '@/lib/alerts/engine'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Read last_draft_count directly from stores table
  // The pipeline writes this field directly — no separate products table needed
  const allStores = await db.query.stores.findMany()

  // Log current draft counts to Axiom for charting
  await logDraftSnapshot(
    allStores.map((s) => ({
      shop_id: s.shop_id,
      store_name: s.name,
      draft_count: s.last_draft_count,
    }))
  )

  const storeMap = new Map(
    allStores.map((s) => [
      s.shop_id,
      { id: s.id, name: s.name, threshold: s.draft_alert_threshold },
    ])
  )

  await evaluateAlerts({
    draftCounts: new Map(allStores.map((s) => [s.shop_id, s.last_draft_count])),
    storeMap,
    unreadMessages: new Map(),
    apiBalances: new Map(),
    apiDailySpend: new Map(),
    publishedToday: new Map(),
  })

  return new Response('OK', { status: 200 })
}
