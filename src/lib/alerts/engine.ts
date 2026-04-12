import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alert_rules, triggered_alerts } from '@/lib/db/schema'

export interface AlertContext {
  draftCounts: Map<number, number> // shop_id → draft count
  storeMap: Map<number, { id: string; name: string; threshold: number }>
  unreadMessages: Map<string, number> // store_id → unread count
  apiBalances: Map<string, number> // service → balance (USD)
  apiDailySpend: Map<string, number> // service → today's spend (USD or requests)
  publishedToday: Map<number, number> // shop_id → published count today
}

/**
 * Evaluates all enabled alert rules against the current context.
 * Fires alerts (inserts into triggered_alerts) for any rule that trips,
 * with a 1-hour dedup window to prevent alert storms.
 */
export async function evaluateAlerts(ctx: AlertContext): Promise<void> {
  const rules = await db.query.alert_rules.findMany({
    where: eq(alert_rules.enabled, true),
  })

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  for (const rule of rules) {
    const threshold = Number(rule.threshold)

    try {
      switch (rule.rule_type) {
        case 'low_drafts': {
          // Check all stores (if rule.store_id is null) or just the specific store
          const targetStores = rule.store_id
            ? [[...ctx.storeMap.entries()].find(([, s]) => s.id === rule.store_id)].filter(
                Boolean
              )
            : [...ctx.storeMap.entries()]

          for (const entry of targetStores) {
            if (!entry) continue
            const [shopId, store] = entry
            const count = ctx.draftCounts.get(shopId) ?? 0
            const effectiveThreshold = rule.store_id ? threshold : store.threshold
            if (count < effectiveThreshold) {
              const alreadyFired = await recentAlertExists(rule.id, store.id, oneHourAgo)
              if (!alreadyFired) {
                await fireAlert(
                  rule.id,
                  store.id,
                  `Store "${store.name}" has only ${count} drafts remaining (threshold: ${effectiveThreshold})`
                )
              }
            }
          }
          break
        }

        case 'api_budget': {
          const service = rule.service!
          const spend = ctx.apiDailySpend.get(service) ?? 0
          if (spend > threshold) {
            const alreadyFired = await recentAlertExists(rule.id, null, oneHourAgo)
            if (!alreadyFired) {
              await fireAlert(
                rule.id,
                null,
                `${service} daily spend ${spend.toFixed(2)} exceeds budget threshold ${threshold}`
              )
            }
          }
          break
        }

        case 'api_balance': {
          const service = rule.service!
          const balance = ctx.apiBalances.get(service) ?? 0
          if (balance < threshold) {
            const alreadyFired = await recentAlertExists(rule.id, null, oneHourAgo)
            if (!alreadyFired) {
              await fireAlert(
                rule.id,
                null,
                `${service} balance $${balance.toFixed(2)} is below minimum $${threshold}`
              )
            }
          }
          break
        }

        case 'unread_message': {
          // threshold = hours before firing. Handled per-message in poll-email cron.
          // Here we check aggregate stale unread counts per store.
          for (const [storeId, unreadCount] of ctx.unreadMessages.entries()) {
            if (unreadCount > 0) {
              const store = [...ctx.storeMap.values()].find((s) => s.id === storeId)
              if (!store) continue
              const alreadyFired = await recentAlertExists(rule.id, storeId, oneHourAgo)
              if (!alreadyFired) {
                await fireAlert(
                  rule.id,
                  storeId,
                  `Store "${store.name}" has ${unreadCount} unread message(s) older than ${threshold}h`
                )
              }
            }
          }
          break
        }

        case 'zero_publishing': {
          const targetStores = rule.store_id
            ? [[...ctx.storeMap.entries()].find(([, s]) => s.id === rule.store_id)].filter(
                Boolean
              )
            : [...ctx.storeMap.entries()]

          for (const entry of targetStores) {
            if (!entry) continue
            const [shopId, store] = entry
            const count = ctx.publishedToday.get(shopId) ?? 0
            if (count === 0) {
              const alreadyFired = await recentAlertExists(rule.id, store.id, oneHourAgo)
              if (!alreadyFired) {
                await fireAlert(
                  rule.id,
                  store.id,
                  `Store "${store.name}" has published 0 products in the last 24 hours`
                )
              }
            }
          }
          break
        }
      }
    } catch (err) {
      console.error(`Alert evaluation failed for rule ${rule.id} (${rule.rule_type}):`, err)
    }
  }
}

async function recentAlertExists(
  ruleId: string,
  storeId: string | null,
  since: Date
): Promise<boolean> {
  const conditions = [
    eq(triggered_alerts.rule_id, ruleId),
    gte(triggered_alerts.triggered_at, since),
    storeId ? eq(triggered_alerts.store_id, storeId) : isNull(triggered_alerts.store_id),
  ]
  const existing = await db.query.triggered_alerts.findFirst({
    where: and(...conditions),
  })
  return !!existing
}

async function fireAlert(
  ruleId: string,
  storeId: string | null,
  message: string
): Promise<void> {
  await db.insert(triggered_alerts).values({
    rule_id: ruleId,
    store_id: storeId ?? undefined,
    message,
  })
  console.log(`[ALERT FIRED] ${message}`)
}
