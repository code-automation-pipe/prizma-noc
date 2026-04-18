export const runtime = 'nodejs'

/**
 * POST /api/cron/modal-billing
 * Called by the Python sync script in the Modal project.
 * Body: { cumulative_usd: number }
 *
 * Computes the delta vs the last synced total (stored as balance_snapshot),
 * writes a spend entry for the delta, and updates the snapshot.
 */

import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'
import { desc, eq, and } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  cumulative_usd: z.number().nonnegative(),
})

export async function POST(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return new Response('Invalid body', { status: 400 })
  }

  const { cumulative_usd } = body

  // Read the last synced total from the most recent balance_snapshot for modal
  const [lastSnapshot] = await db
    .select()
    .from(api_ledger)
    .where(and(eq(api_ledger.service, 'modal'), eq(api_ledger.entry_type, 'balance_snapshot')))
    .orderBy(desc(api_ledger.created_at))
    .limit(1)

  const lastTotal = lastSnapshot ? Number(lastSnapshot.amount) : 0
  const delta = Math.max(0, cumulative_usd - lastTotal)

  if (delta > 0) {
    await db.insert(api_ledger).values({
      service: 'modal',
      entry_type: 'spend',
      amount: String(delta.toFixed(6)),
      note: `auto-synced (total=${cumulative_usd.toFixed(4)})`,
    })
    console.log(`[modal-billing] recorded spend delta $${delta.toFixed(4)} (total $${cumulative_usd.toFixed(4)})`)
  } else {
    console.log(`[modal-billing] no new spend (total $${cumulative_usd.toFixed(4)} unchanged)`)
  }

  // Always update the snapshot so the next sync can compute the delta
  await db.insert(api_ledger).values({
    service: 'modal',
    entry_type: 'balance_snapshot',
    amount: String(cumulative_usd.toFixed(6)),
    note: 'auto-synced cumulative total',
  })

  return Response.json({ ok: true, delta, cumulative_usd })
}
