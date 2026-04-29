import type { StoreHealth } from '@/lib/health'

export type { StoreHealth }

export interface StoreWithStatus {
  id: string
  name: string
  shop_id: number
  outlook_email: string
  draft_alert_threshold: number
  last_draft_count: number        // live: products with pipeline_status = 'none' OR NULL
  last_draft_snapshot_at: string | null
  created_at: string
  unread_message_count: number
  published_today: number         // products with completed_at AND uploaded_at >= today
  drafts_made_today: number       // delta: prev snapshot minus current not_processed
  items_completed_today: number   // products with completed_at >= today
  items_failed_today: number      // worker item_failed events in Axiom, last 24h
  ready_to_process: number        // live: products with pipeline_status = 'completed' (post-pipeline, pre-upload)
  uploaded: number                // live: products with pipeline_status = 'uploaded'
  email_screener_connected: boolean // true = IMAP app password is configured
  health: StoreHealth
}

export interface PipelineItemStats {
  shop_id: number
  completed: number
  failed: number
}

export interface ApiWalletService {
  service: 'oxylabs' | 'gemini'
  label: string
  balance: number | null // null = not available (OxyLabs)
  daily_spend: number
  cumulative_spend: number
  daily_requests?: number // OxyLabs only
  is_live: boolean // true = fetched live via API
}

export interface LedgerSummary {
  /** USD balance = topup + free_credit - spend */
  balances: Record<string, number>
  /** Gross credits added (topup + free_credit), before spend */
  credits: Record<string, number>
  /** Quota % (0–100) from latest balance_snapshot — only populated for Gemini */
  quota_percent: Record<string, number>
  daily_spend: Record<string, number>
  cumulative_spend: Record<string, number>
  /** Monthly request totals — populated for OxyLabs */
  monthly_requests: Record<string, number>
  /** Plan limits — from env vars (e.g. OXYLABS_MONTHLY_LIMIT) */
  plan_limits: Record<string, number>
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
