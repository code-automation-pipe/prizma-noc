import type { StoreHealth } from '@/lib/health'

export type { StoreHealth }

export interface StoreWithStatus {
  id: string
  name: string
  shop_id: number
  outlook_email: string
  draft_alert_threshold: number
  last_draft_count: number
  last_draft_snapshot_at: string | null
  created_at: string
  unread_message_count: number
  published_today: number
  health: StoreHealth
}

export interface ApiWalletService {
  service: 'oxylabs' | 'gemini' | 'tmapi' | 'modal'
  label: string
  balance: number | null // null = not available (OxyLabs)
  daily_spend: number
  cumulative_spend: number
  daily_requests?: number // OxyLabs only
  is_live: boolean // true = fetched live via API
}

export interface LedgerSummary {
  balances: Record<string, number>
  daily_spend: Record<string, number>
  cumulative_spend: Record<string, number>
}

export interface AlertRuleWithMeta {
  id: string
  store_id: string | null
  service: string | null
  rule_type: string
  threshold: string
  enabled: boolean
}

export interface TriggeredAlertWithRule {
  id: string
  rule_id: string
  store_id: string | null
  message: string
  triggered_at: string
  rule: AlertRuleWithMeta | null
}

export interface DashboardData {
  stores: StoreWithStatus[]
  ledger: LedgerSummary
  recent_alerts: TriggeredAlertWithRule[]
  last_refreshed: string
}
