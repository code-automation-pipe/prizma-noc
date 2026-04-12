import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { triggered_alerts } from '@/lib/db/schema'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)))
  const offset = (page - 1) * limit

  const alerts = await db.query.triggered_alerts.findMany({
    orderBy: desc(triggered_alerts.triggered_at),
    limit,
    offset,
  })

  return Response.json(
    alerts.map((a) => ({
      ...a,
      triggered_at: a.triggered_at.toISOString(),
    }))
  )
}
