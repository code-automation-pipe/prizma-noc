import { z } from 'zod'
import { db } from '@/lib/db'
import { alert_rules } from '@/lib/db/schema'

const CreateRuleSchema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  service: z.string().nullable().optional(),
  rule_type: z.enum(['low_drafts', 'api_budget', 'api_balance', 'unread_message', 'zero_publishing']),
  threshold: z.number().positive(),
  enabled: z.boolean().default(true),
})

export async function GET() {
  const rules = await db.query.alert_rules.findMany()
  return Response.json(rules)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = CreateRuleSchema.parse(body)
    const [rule] = await db
      .insert(alert_rules)
      .values({
        store_id: parsed.store_id ?? undefined,
        service: parsed.service ?? undefined,
        rule_type: parsed.rule_type,
        threshold: String(parsed.threshold),
        enabled: parsed.enabled,
      })
      .returning()
    return Response.json(rule, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
