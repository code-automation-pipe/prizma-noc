export const runtime = 'nodejs'
export const maxDuration = 30

import { probeGeminiQuota } from '@/lib/gemini/client'
import { fetchGeminiQuotaUsage } from '@/lib/gemini/quota-client'
import { logApiBalance } from '@/lib/axiom/events'
import { db } from '@/lib/db'
import { api_ledger } from '@/lib/db/schema'
import { evaluateAlerts } from '@/lib/alerts/engine'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const apiBalances = new Map<string, number>()

  // --- Gemini ---
  try {
    // First: verify the API key is alive
    const gemini = await probeGeminiQuota()
    if (!gemini?.alive) {
      console.warn('[gemini] probe failed — storing error snapshot')
      await db.insert(api_ledger).values({
        service: 'gemini',
        entry_type: 'balance_snapshot',
        amount: '0',
        note: 'probe failed',
      })
      apiBalances.set('gemini', 0)
    } else {
      // Try to get real quota % from Cloud Monitoring (requires service account + Vertex AI)
      // NOTE: AI Studio API keys do NOT expose quota metrics via Cloud Monitoring —
      //       only Vertex AI does. If this returns null, alive probe is the fallback.
      const quota = await fetchGeminiQuotaUsage()

      if (quota) {
        // Store remaining % (0–100)
        console.log(`[gemini] quota ${quota.remainingPercent}% remaining`)
        await db.insert(api_ledger).values({
          service: 'gemini',
          entry_type: 'balance_snapshot',
          amount: String(quota.remainingPercent),
          note: `${quota.tokensUsed}/${quota.tokensLimit} tokens used (${quota.quotaMetric})`,
        })
        apiBalances.set('gemini', quota.remainingPercent)
        try {
          await logApiBalance({ service: 'gemini', balance: quota.remainingPercent, quota_health: quota.remainingPercent / 100 })
        } catch (axiomErr) {
          console.warn('[gemini] Axiom log failed (non-fatal):', axiomErr)
        }
      } else {
        // No service account configured — fall back to alive indicator
        console.log('[gemini] no quota data (service account not configured) — storing alive=1')
        await db.insert(api_ledger).values({
          service: 'gemini',
          entry_type: 'balance_snapshot',
          amount: '1',
          note: `alive, probe=${gemini.probeTokenCount} tokens`,
        })
        apiBalances.set('gemini', 1)
        try {
          await logApiBalance({ service: 'gemini', balance: 1, quota_health: 1 })
        } catch (axiomErr) {
          console.warn('[gemini] Axiom log failed (non-fatal):', axiomErr)
        }
      }
    }
  } catch (err) {
    console.error('Gemini probe failed:', err)
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
