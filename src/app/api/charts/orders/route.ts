import { type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { etsy_messages, stores } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${etsy_messages.received_at}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        store_name: stores.name,
        order_count: sql<number>`count(*)::int`,
        revenue_usd: sql<string>`coalesce(sum(${etsy_messages.price_usd}), 0)::text`,
      })
      .from(etsy_messages)
      .innerJoin(stores, sql`${stores.id} = ${etsy_messages.store_id}`)
      .where(
        // Exclude rows whose subject indicates a refund — historical rows from
        // before refund detection landed are stored with type='order' but have
        // "refund" in the subject. Going forward these come in as type='refund'
        // and are filtered by the type check.
        sql`${etsy_messages.type} = 'order' AND ${etsy_messages.subject} !~* '\\mrefund' AND ${etsy_messages.received_at} > now() - (${days} || ' days')::interval`,
      )
      .groupBy(sql`1`, stores.name)
      .orderBy(sql`1 asc`)

    const out = rows.map((r) => ({
      _time: r.day,
      store_name: r.store_name,
      order_count: Number(r.order_count),
      revenue_usd: Number(r.revenue_usd),
    }))
    return Response.json(out)
  } catch (err) {
    console.error('[charts/orders]', err)
    return Response.json([])
  }
}
