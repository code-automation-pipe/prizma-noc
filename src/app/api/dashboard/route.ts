import { count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { api_ledger, etsy_messages, stores, triggered_alerts } from '@/lib/db/schema'
import { getPublishedTodayPerShop, getDraftStatePerShop, getPipelineSpend, getDraftCountsPerShop } from '@/lib/db/workers-db'
import { decryptCredentials } from '@/lib/crypto/credentials'
import { computeStoreHealth } from '@/lib/health'
import type { DashboardData, LedgerSummary, StoreWithStatus } from '@/types'

export const revalidate = 60

export async function GET() {
  const [allStores, unreadCounts, recentAlerts, ledgerEntries, pipelineSpend, publishedCounts, draftStateCounts, productCounts] = await Promise.all([
    db.query.stores.findMany({
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
    getPipelineSpend().catch((e) => { console.error('[workers-db] getPipelineSpend failed:', e); return null }),
    getPublishedTodayPerShop().catch((e) => { console.error('[workers-db] getPublishedTodayPerShop failed:', e); return [] }),
    getDraftStatePerShop().catch((e) => { console.error('[workers-db] getDraftStatePerShop failed:', e); return [] }),
    getDraftCountsPerShop().catch((e) => { console.error('[workers-db] getDraftCountsPerShop failed:', e); return [] }),
  ])

  // Build unread map
  const unreadMap = new Map(unreadCounts.map((u) => [u.store_id, u.count]))

  // Compute ledger summaries per service
  const services = ['gemini', 'tmapi', 'modal', 'oxylabs', 'axiom'] as const
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
      // Written by the Modal pipeline after each product run
      dailySpend['gemini']      = pipelineSpend.today_usd
      cumulativeSpend['gemini'] = pipelineSpend.cumulative_usd
      if (hasCredits) balances['gemini'] = credits - pipelineSpend.cumulative_usd
    } else {
      // modal, tmapi: manual ledger spend entries
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
      } else if (snapshots.length > 0 && (service === 'tmapi' || service === 'axiom')) {
        // Live-fetched services: use latest balance_snapshot as balance when no manual credits logged
        balances[service] = Number(snapshots[0].amount)
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

  // Build published/draft-state maps (products table may not exist — fail silently)
  const publishedMap    = new Map(publishedCounts.map((p) => [p.shop_id, p.draft_count]))
  const productCountMap = new Map(productCounts.map((p) => [p.shop_id, p.draft_count]))
  const draftStateMap   = new Map(draftStateCounts.map((d) => [d.shop_id, d.draft_count]))

  // Build store status list
  const storeList: StoreWithStatus[] = allStores.map((s) => {
    const unreadCount      = unreadMap.get(s.id) ?? 0
    const notProcessed     = s.last_draft_count  // pipeline writes this directly
    const publishedToday   = publishedMap.get(s.shop_id) ?? 0
    const totalNotUploaded = productCountMap.get(s.shop_id) ?? 0
    const inPipeline       = draftStateMap.get(s.shop_id) ?? 0
    const draftsState      = Math.max(0, totalNotUploaded - inPipeline)
    const draftsMadeToday  = 0  // not tracked without products table

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
      drafts_state: draftsState,
      email_screener_connected: emailScreenerConnected,
      health: computeStoreHealth(emailScreenerConnected),
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
