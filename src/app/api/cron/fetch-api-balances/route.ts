export const runtime = 'nodejs'
export const maxDuration = 30

import { probeGeminiQuota } from '@/lib/gemini/client'
import { fetchTmapiBalance } from '@/lib/tmapi/client'
import { fetchModalBalance } from '@/lib/modal/client'
import { logApiBalance } from '@/lib/axiom/events'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'
import { eq, sum } from 'drizzle-orm'
import { evaluateAlerts } from '@/lib/alerts/engine'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const apiBalances = new Map<string, number>()

  // --- Gemini ---
  try {
    const gemini = await probeGeminiQuota()
    if (gemini) {
      await logApiBalance({
        service: 'gemini',
        balance: gemini.quotaHealth,
        quota_health: gemini.quotaHealth,
      })
      const ledgerResult = await db
        .select({ total: sum(api_ledger.amount) })
        .from(api_ledger)
        .where(eq(api_ledger.service, 'gemini'))
      apiBalances.set('gemini', Number(ledgerResult[0]?.total ?? 0))
    }
  } catch (err) {
    console.error('Gemini probe failed:', err)
  }

  // --- TMAPI ---
  try {
    const tmapi = await fetchTmapiBalance()
    if (tmapi) {
      await logApiBalance({ service: 'tmapi', balance: tmapi.balance })
      apiBalances.set('tmapi', tmapi.balance)
      await db.insert(api_ledger).values({
        service: 'tmapi',
        entry_type: 'balance_snapshot',
        amount: String(tmapi.balance),
        note: 'auto-fetched',
      })
    }
  } catch (err) {
    console.error('TMAPI balance fetch failed:', err)
  }

  // --- Modal ---
  try {
    const modal = await fetchModalBalance()
    if (modal) {
      await logApiBalance({ service: 'modal', balance: modal.balance })
      apiBalances.set('modal', modal.balance)
      await db.insert(api_ledger).values({
        service: 'modal',
        entry_type: 'balance_snapshot',
        amount: String(modal.balance),
        note: 'auto-fetched',
      })
    }
  } catch (err) {
    console.error('Modal balance fetch failed:', err)
  }

  await evaluateAlerts({
    draftCounts: new Map(),
    storeMap: new Map(),
    unreadMessages: new Map(),
    apiBalances,
    apiDailySpend: new Map(),
    publishedToday: new Map(),
  })

  return new Response('OK', { status: 200 })
}
