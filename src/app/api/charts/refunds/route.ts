import { type NextRequest } from 'next/server'
import { and, eq, gt, or, sql } from 'drizzle-orm'
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
    const since = new Date(Date.now() - days * 86_400_000)

    // Match new rows (type='refund') AND legacy rows stored as type='order'
    // with "refund" in the subject — the same back-compat path used by the
    // orders chart and the messages feed.
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${etsy_messages.received_at}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        store_name: stores.name,
        refund_count: sql<number>`count(*)::int`,
        refund_usd: sql<string>`coalesce(sum(${etsy_messages.price_usd}), 0)::text`,
      })
      .from(etsy_messages)
      .innerJoin(stores, eq(stores.id, etsy_messages.store_id))
      .where(
        and(
          or(
            eq(etsy_messages.type, 'refund'),
            and(eq(etsy_messages.type, 'order'), sql`${etsy_messages.subject} ~* '\\mrefund'`),
          ),
          gt(etsy_messages.received_at, since),
        ),
      )
      .groupBy(
        sql`to_char(date_trunc('day', ${etsy_messages.received_at}) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        stores.name,
      )
      .orderBy(sql`1 asc`)

    const out = rows.map((r) => ({
      _time: r.day,
      store_name: r.store_name,
      refund_count: Number(r.refund_count),
      refund_usd: Number(r.refund_usd),
    }))
    return Response.json(out)
  } catch (err) {
    console.error('[charts/refunds]', err)
    return Response.json([])
  }
}
