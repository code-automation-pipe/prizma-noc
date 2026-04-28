import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { alert_rules, triggered_alerts } from '@/lib/db/schema'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)))
  const offset = (page - 1) * limit

  // LEFT JOIN so the AlertsFeed UI can render the rule_type badge correctly.
  // Previously the route returned only triggered_alerts and the UI fell back to
  // 'unknown' for every entry.
  const rows = await db
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
    .limit(limit)
    .offset(offset)

  return Response.json(
    rows.map((r) => ({
      id: r.id,
      rule_id: r.rule_id,
      store_id: r.store_id,
      message: r.message,
      triggered_at: r.triggered_at.toISOString(),
      rule: r.rule_id_full
        ? {
            id: r.rule_id_full,
            store_id: r.rule_store_id,
            service: r.rule_service,
            rule_type: r.rule_type,
            threshold: r.rule_threshold,
            enabled: r.rule_enabled,
          }
        : null,
    }))
  )
}
