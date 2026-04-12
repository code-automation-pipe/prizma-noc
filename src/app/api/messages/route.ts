import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { etsy_messages } from '@/lib/db/schema'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)))
  const offset = (page - 1) * limit

  const conditions = storeId ? [eq(etsy_messages.store_id, storeId)] : []

  const msgs = await db.query.etsy_messages.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: desc(etsy_messages.received_at),
    limit,
    offset,
  })

  return Response.json(
    msgs.map((m) => ({
      ...m,
      received_at: m.received_at.toISOString(),
      created_at: m.created_at.toISOString(),
    }))
  )
}
