import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { alert_rules } from '@/lib/db/schema'

const UpdateRuleSchema = z.object({
  threshold: z.number().positive().optional(),
  enabled: z.boolean().optional(),
  service: z.string().nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = UpdateRuleSchema.parse(body)
    const updates: Partial<typeof alert_rules.$inferInsert> = {}
    if (parsed.threshold !== undefined) updates.threshold = String(parsed.threshold)
    if (parsed.enabled !== undefined) updates.enabled = parsed.enabled
    if (parsed.service !== undefined) updates.service = parsed.service ?? undefined
    await db.update(alert_rules).set(updates).where(eq(alert_rules.id, id))
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.delete(alert_rules).where(eq(alert_rules.id, id))
  return Response.json({ ok: true })
}
