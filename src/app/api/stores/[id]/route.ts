import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { encryptCredentials } from '@/lib/crypto/credentials'

export const runtime = 'nodejs'

const UpdateStoreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  draft_alert_threshold: z.number().int().positive().optional(),
  outlook_email: z.string().email().optional(),
  outlook_credentials: z
    .object({
      appPassword: z.string().min(1),
    })
    .optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, id),
    columns: { outlook_credentials: false },
  })
  if (!store) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(store)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = UpdateStoreSchema.parse(body)

    const updates: Partial<typeof stores.$inferInsert> = {}
    if (parsed.name) updates.name = parsed.name
    if (parsed.draft_alert_threshold) updates.draft_alert_threshold = parsed.draft_alert_threshold
    if (parsed.outlook_email) updates.outlook_email = parsed.outlook_email
    if (parsed.outlook_credentials) {
      updates.outlook_credentials = encryptCredentials(JSON.stringify(parsed.outlook_credentials))
    }

    await db.update(stores).set(updates).where(eq(stores.id, id))
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
  await db.delete(stores).where(eq(stores.id, id))
  return Response.json({ ok: true })
}
