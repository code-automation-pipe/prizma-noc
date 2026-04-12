import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { etsy_messages } from '@/lib/db/schema'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  await db
    .update(etsy_messages)
    .set({ is_read: Boolean(body.is_read) })
    .where(eq(etsy_messages.id, id))
  return Response.json({ ok: true })
}
