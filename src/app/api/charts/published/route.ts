import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getPublishedDailyPerShop } from '@/lib/db/workers-db'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    const [rows, allStores] = await Promise.all([
      getPublishedDailyPerShop(days),
      db.query.stores.findMany({ columns: { shop_id: true, name: true } }),
    ])
    const nameByShop = new Map(allStores.map((s) => [s.shop_id, s.name]))

    const out = rows.map((r) => ({
      _time: r.day,
      store_name: nameByShop.get(r.shop_id) ?? `shop ${r.shop_id}`,
      total: r.published_count,
    }))
    return Response.json(out)
  } catch (err) {
    console.error('[charts/published]', err)
    return Response.json([])
  }
}
