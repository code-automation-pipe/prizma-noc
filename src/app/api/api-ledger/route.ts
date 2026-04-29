import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'

const AddEntrySchema = z.object({
  service: z.enum(['gemini']),
  entry_type: z.enum(['topup', 'free_credit', 'spend']),
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
})

export async function GET() {
  const entries = await db.query.api_ledger.findMany({
    orderBy: desc(api_ledger.created_at),
  })

  const services = ['gemini'] as const
  const balances: Record<string, number> = {}
  const dailySpend: Record<string, number> = {}
  const cumulativeSpend: Record<string, number> = {}
  const todayStr = new Date().toDateString()

  for (const service of services) {
    const serviceEntries = entries.filter((e) => e.service === service)
    let balance = 0
    let cumSpend = 0
    let todayS = 0
    for (const e of serviceEntries) {
      const amt = Number(e.amount)
      if (e.entry_type === 'topup' || e.entry_type === 'free_credit') {
        balance += amt
      } else if (e.entry_type === 'spend') {
        balance -= amt
        cumSpend += amt
        if (new Date(e.created_at).toDateString() === todayStr) {
          todayS += amt
        }
      }
      // balance_snapshot entries are not part of USD accounting — skip
    }
    balances[service] = balance
    dailySpend[service] = todayS
    cumulativeSpend[service] = cumSpend
  }

  return Response.json({
    entries: entries.map((e) => ({ ...e, created_at: e.created_at.toISOString() })),
    balances,
    daily_spend: dailySpend,
    cumulative_spend: cumulativeSpend,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = AddEntrySchema.parse(body)
    const [entry] = await db
      .insert(api_ledger)
      .values({
        service: parsed.service,
        entry_type: parsed.entry_type,
        amount: String(parsed.amount),
        note: parsed.note,
      })
      .returning()
    return Response.json(entry, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
