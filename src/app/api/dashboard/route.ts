import { count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alert_rules, api_ledger, etsy_messages, stores, triggered_alerts } from '@/lib/db/schema'
import { getShopMetrics, getPipelineSpend } from '@/lib/db/workers-db'
import { decryptCredentials } from '@/lib/crypto/credentials'
import { computeStoreHealth } from '@/lib/health'
import { fetchPipelineItemsToday } from '@/lib/axiom/pipeline'
import type { DashboardData, LedgerSummary, StoreWithStatus } from '@/types'

export const revalidate = 60

export async function GET() {
  const [
    allStores,
    unreadCounts,
    recentAlerts,
    ledgerEntries,
    pipelineSpend,
    shopMetrics,
    pipelineItemsToday,
  ] = await Promise.all([
    db.query.stores.findMany({
      orderBy: (s, { asc }) => asc(s.name),
    }),
    db
      .select({ store_id: etsy_messages.store_id, count: count() })
      .from(etsy_messages)
      .where(eq(etsy_messages.is_read, false))
      .groupBy(etsy_messages.store_id),
    db
      .select({
        id: triggered_alerts.id,
        rule_id: triggered_alerts.rule_id,
        store_id: triggered_alerts.store_id,
        message: triggered_alerts.message,
        triggered_at: triggered_alerts.triggered_at,
        rule_id_full: alert_rules.id,
        rule_store_id: alert_rules.store_id,
        rule_service: alert_rules.service,
        rule_type: alert_rules.rule_type,
        rule_threshold: alert_rules.threshold,
        rule_enabled: alert_rules.enabled,
      })
      .from(triggered_alerts)
      .leftJoin(alert_rules, eq(alert_rules.id, triggered_alerts.rule_id))
      .orderBy(desc(triggered_alerts.triggered_at))
      .limit(50),
    db.query.api_ledger.findMany({
      orderBy: desc(api_ledger.created_at),
    }),
    getPipelineSpend().catch((e) => { console.error('[workers-db] getPipelineSpend failed:', e); return null }),
    getShopMetrics().catch((e) => { console.error('[workers-db] getShopMetrics failed:', e); return [] }),
    fetchPipelineItemsToday().catch((e) => { console.error('[axiom-pipeline] failed:', e); return new Map<number, { completed: number; failed: number }>() }),
  ])

  // Build unread map
  const unreadMap = new Map(unreadCounts.map((u) => [u.store_id, u.count]))

  // Compute ledger summaries per service
  const services = ['gemini', 'oxylabs'] as const
  const balances: Record<string, number> = {}
  const grossCredits: Record<string, number> = {}
  const quotaPercent: Record<string, number> = {}
  const dailySpend: Record<string, number> = {}
  const cumulativeSpend: Record<string, number> = {}
  const todayStr = new Date().toDateString()

  for (const service of services) {
    const serviceEntries = ledgerEntries.filter((e) => e.service === service)

    // Quota % from latest balance_snapshot (Gemini only — stored as 0–100 or 0/1)
    const snapshots = serviceEntries
      .filter((e) => e.entry_type === 'balance_snapshot')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (snapshots.length > 0) {
      quotaPercent[service] = Number(snapshots[0].amount)
    }

    // Credits from ledger (topup + free_credit entries only)
    let credits = 0
    let hasCredits = false
    for (const e of serviceEntries) {
      if (e.entry_type === 'topup' || e.entry_type === 'free_credit') {
        credits += Number(e.amount)
        hasCredits = true
      }
    }
    if (hasCredits) grossCredits[service] = credits

    if (service === 'gemini' && pipelineSpend) {
      // Gemini (Google AI Studio) spend = pipeline_cost_usd from the workers DB
      dailySpend['gemini']      = pipelineSpend.today_usd
      cumulativeSpend['gemini'] = pipelineSpend.cumulative_usd
      if (hasCredits) balances['gemini'] = credits - pipelineSpend.cumulative_usd
    } else {
      // Other services: manual ledger spend entries
      let cumSpend = 0
      let todaySpend = 0
      for (const e of serviceEntries) {
        if (e.entry_type === 'spend') {
          const amt = Number(e.amount)
          cumSpend += amt
          if (new Date(e.created_at).toDateString() === todayStr) todaySpend += amt
        }
      }
      dailySpend[service]      = todaySpend
      cumulativeSpend[service] = cumSpend
      if (hasCredits) {
        balances[service] = credits - cumSpend
      }
    }
  }

  // OxyLabs monthly requests from latest balance_snapshot
  const monthlyRequests: Record<string, number> = {}
  const oxylabsSnapshots = ledgerEntries
    .filter((e) => e.service === 'oxylabs' && e.entry_type === 'balance_snapshot')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  if (oxylabsSnapshots.length > 0) {
    monthlyRequests['oxylabs'] = Number(oxylabsSnapshots[0].amount)
  }

  // Plan limits from env vars
  const planLimits: Record<string, number> = {}
  if (process.env.OXYLABS_MONTHLY_LIMIT) {
    planLimits['oxylabs'] = Number(process.env.OXYLABS_MONTHLY_LIMIT)
  }

  const ledger: LedgerSummary = {
    balances,
    credits: grossCredits,
    quota_percent: quotaPercent,
    daily_spend: dailySpend,
    cumulative_spend: cumulativeSpend,
    monthly_requests: monthlyRequests,
    plan_limits: planLimits,
  }

  const publishedMap      = new Map(shopMetrics.map((m) => [m.shop_id, m.published_today]))
  const completedMap      = new Map(shopMetrics.map((m) => [m.shop_id, m.completed_today]))
  const notProcessedMap   = new Map(shopMetrics.map((m) => [m.shop_id, m.not_processed]))
  const readyToProcessMap = new Map(shopMetrics.map((m) => [m.shop_id, m.ready_to_process]))
  const uploadedMap       = new Map(shopMetrics.map((m) => [m.shop_id, m.uploaded]))

  // Build store status list
  const storeList: StoreWithStatus[] = allStores.map((s) => {
    const unreadCount      = unreadMap.get(s.id) ?? 0
    const notProcessed   = notProcessedMap.get(s.shop_id) ?? 0
    const publishedToday = publishedMap.get(s.shop_id) ?? 0
    const completedToday = completedMap.get(s.shop_id) ?? 0
    const draftsMadeToday = 0
    const itemStats = pipelineItemsToday.get(s.shop_id) ?? { completed: 0, failed: 0 }

    // Check if email screener credentials are configured (OAuth2 or app password)
    let emailScreenerConnected = false
    try {
      const creds = JSON.parse(decryptCredentials(s.outlook_credentials))
      // Only OAuth2 refresh token counts as connected — app passwords are blocked by Microsoft
      emailScreenerConnected = typeof creds?.refreshToken === 'string' && creds.refreshToken.length > 0
    } catch {
      // credentials missing or malformed
    }

    return {
      id: s.id,
      name: s.name,
      shop_id: s.shop_id,
      outlook_email: s.outlook_email,
      draft_alert_threshold: s.draft_alert_threshold,
      last_draft_count: notProcessed,
      last_draft_snapshot_at: s.last_draft_snapshot_at?.toISOString() ?? null,
      created_at: s.created_at.toISOString(),
      unread_message_count: unreadCount,
      published_today: publishedToday,
      drafts_made_today: draftsMadeToday,
      items_completed_today: completedToday,
      items_failed_today: itemStats.failed,
      ready_to_process: readyToProcessMap.get(s.shop_id) ?? 0,
      uploaded: uploadedMap.get(s.shop_id) ?? 0,
      email_screener_connected: emailScreenerConnected,
      health: computeStoreHealth(emailScreenerConnected, notProcessed ?? 0, s.draft_alert_threshold),
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
      rule: a.rule_id_full
        ? {
            id: a.rule_id_full,
            store_id: a.rule_store_id,
            service: a.rule_service,
            rule_type: a.rule_type as string,
            threshold: a.rule_threshold as string,
            enabled: a.rule_enabled as boolean,
          }
        : null,
    })),
    last_refreshed: new Date().toISOString(),
  }

  return Response.json(data)
}
