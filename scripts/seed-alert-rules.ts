/**
 * Seeds a sensible set of default global alert rules if none exist.
 * Idempotent — running twice is a no-op.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/seed-alert-rules.ts
 */
import { db } from '../src/lib/db'
import { alert_rules } from '../src/lib/db/schema'

interface DefaultRule {
  rule_type: 'low_drafts' | 'api_budget' | 'api_balance' | 'unread_message' | 'zero_publishing'
  service: string | null
  threshold: number
  description: string
}

const DEFAULTS: DefaultRule[] = [
  // Per-store: alert if any store has fewer than 10 unprocessed drafts.
  // (store_id stays null = global; the rule honors each store's draft_alert_threshold.)
  { rule_type: 'low_drafts',      service: null,      threshold: 10,   description: 'low_drafts (uses per-store threshold)' },

  // API balance floors — fire when balance dips below threshold.
  { rule_type: 'api_balance',     service: 'gemini',  threshold: 5,    description: 'gemini balance < $5' },
  { rule_type: 'api_balance',     service: 'tmapi',   threshold: 5,    description: 'tmapi balance < $5' },

  // Daily spend ceiling — fire when daily spend on a service exceeds $X.
  { rule_type: 'api_budget',      service: 'gemini',  threshold: 25,   description: 'gemini daily spend > $25' },
  { rule_type: 'api_budget',      service: 'tmapi',   threshold: 25,   description: 'tmapi daily spend > $25' },

  // Engagement — alert when a store goes 24h without publishing.
  { rule_type: 'zero_publishing', service: null,      threshold: 24,   description: 'zero published items in last 24h' },

  // Unread customer messages — engine fires once per hour per store with unreads.
  { rule_type: 'unread_message',  service: null,      threshold: 1,    description: 'unread message present' },
]

async function main() {
  const existing = await db.query.alert_rules.findMany()
  if (existing.length > 0) {
    console.log(`[seed-alerts] ${existing.length} alert rule(s) already exist — skipping.`)
    console.log('  Existing:')
    for (const r of existing) {
      console.log(`   • ${r.rule_type}${r.service ? ` (${r.service})` : ''} threshold=${r.threshold} enabled=${r.enabled}`)
    }
    return
  }

  console.log(`[seed-alerts] No rules found — inserting ${DEFAULTS.length} defaults…`)
  for (const d of DEFAULTS) {
    await db.insert(alert_rules).values({
      store_id: null,
      service: d.service,
      rule_type: d.rule_type,
      threshold: String(d.threshold),
      enabled: true,
    })
    console.log(`  + ${d.description}`)
  }
  console.log('[seed-alerts] done.')
}

main().catch((err) => { console.error(err); process.exit(1) })
