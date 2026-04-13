import { count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { api_ledger, etsy_messages, stores, triggered_alerts } from '@/lib/db/schema'
import { computeStoreHealth } from '@/lib/health'
import type { DashboardData, LedgerSummary, StoreWithStatus } from '@/types'

export const revalidate = 60

export async function GET() {
  const [allStores, unreadCounts, recentAlerts, ledgerEntries] = await Promise.all([
    db.query.stores.findMany({
      columns: { outlook_credentials: false },
      orderBy: (s, { asc }) => asc(s.name),
    }),
    db
      .select({ store_id: etsy_messages.store_id, count: count() })
      .from(etsy_messages)
      .where(eq(etsy_messages.is_read, false))
      .groupBy(etsy_messages.store_id),
    db.query.triggered_alerts.findMany({
      orderBy: desc(triggered_alerts.triggered_at),
      limit: 50,
    }),
    db.query.api_ledger.findMany({
      orderBy: desc(api_ledger.created_at),
    }),
  ])

  // Build unread map
  const unreadMap = new Map(unreadCounts.map((u) => [u.store_id, u.count]))

  // Compute ledger summaries per service
  const services = ['gemini', 'tmapi', 'modal'] as const
  const balances: Record<string, number> = {}
  const dailySpend: Record<string, number> = {}
  const cumulativeSpend: Record<string, number> = {}
  const todayStr = new Date().toDateString()

  for (const service of services) {
    const serviceEntries = ledgerEntries.filter((e) => e.service === service)
    let balance = 0
    let cumSpend = 0
    let todaySpend = 0

    // Latest balance_snapshot wins — use it as the authoritative balance
    const snapshots = serviceEntries
      .filter((e) => e.entry_type === 'balance_snapshot')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (snapshots.length > 0) {
      balance = Number(snapshots[0].amount)
    } else {
      for (const e of serviceEntries) {
        const amt = Number(e.amount)
        if (e.entry_type === 'topup') balance += amt
        else if (e.entry_type === 'spend') balance -= amt
      }
    }

    for (const e of serviceEntries) {
      if (e.entry_type === 'spend') {
        const amt = Number(e.amount)
        cumSpend += amt
        if (new Date(e.created_at).toDateString() === todayStr) todaySpend += amt
      }
    }

    balances[service] = balance
    dailySpend[service] = todaySpend
    cumulativeSpend[service] = cumSpend
  }

  const ledger: LedgerSummary = {
    balances,
    daily_spend: dailySpend,
    cumulative_spend: cumulativeSpend,
  }

  // Build store status list
  const storeList: StoreWithStatus[] = allStores.map((s) => {
    const unreadCount = unreadMap.get(s.id) ?? 0
    const publishedToday = 0 // Will be enriched by Axiom chart data on the client
    return {
      id: s.id,
      name: s.name,
      shop_id: s.shop_id,
      outlook_email: s.outlook_email,
      draft_alert_threshold: s.draft_alert_threshold,
      last_draft_count: s.last_draft_count,
      last_draft_snapshot_at: s.last_draft_snapshot_at?.toISOString() ?? null,
      created_at: s.created_at.toISOString(),
      unread_message_count: unreadCount,
      published_today: publishedToday,
      health: computeStoreHealth(
        s.last_draft_count,
        s.draft_alert_threshold,
        unreadCount,
        publishedToday
      ),
    }
  })

  const data: DashboardData = {
    stores: storeList,
    ledger,
    recent_alerts: recentAlerts.map((a) => ({
      id: a.id,
      rule_id: a.rule_id,
      store_id: a.store_id ?? null,
      message: a.message,
      triggered_at: a.triggered_at.toISOString(),
      rule: null, // rule details fetched separately if needed
    })),
    last_refreshed: new Date().toISOString(),
  }

  return Response.json(data)
}
