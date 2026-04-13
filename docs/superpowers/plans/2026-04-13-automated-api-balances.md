# Automated API Balance Fetching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three "Manual" API balance cards with auto-fetched data via a new hourly cron, using service-specific probe strategies for Gemini, TMAPI, and Modal.

**Architecture:** Each service gets a focused client module under `src/lib/{service}/client.ts` (same pattern as `src/lib/oxylabs/client.ts`). A new cron route `/api/cron/fetch-api-balances` calls all three, logs results to Axiom, and stores spend entries in `api_ledger` so the existing dashboard balance calculation works unchanged.

**Tech Stack:** Next.js App Router · Neon/Drizzle · Axiom · `node:child_process` (Modal CLI fallback) · Gemini REST API · TMAPI REST API

---

## Service Strategy

| Service | Method | What we get |
|---------|--------|-------------|
| **Gemini** | `POST /v1beta/models/gemini-2.0-flash:countTokens` (free, $0) | Response headers `x-ratelimit-remaining-tokens` + `x-ratelimit-limit-tokens` → quota % + running token count |
| **TMAPI** | `GET https://api.tmapi.io/api/user/balance` with `Authorization: Bearer {key}` | USD credit balance |
| **Modal** | `GET https://api.modal.com/v1/teams/current` with `Authorization: Token {token}` | USD credit balance |

> **Gemini note:** `countTokens` gives _quota health_ (tokens remaining this minute), not USD spend. USD spend is estimated by multiplying cumulative token counts × the current Gemini Flash price ($0.075/1M input, $0.30/1M output). This estimate is stored as a `spend` entry in `api_ledger` on each cron run.

> **TMAPI / Modal:** Verify the exact balance endpoints before running — both services' REST APIs are not well-documented. If the endpoint returns 404, check the service dashboard's network tab and update `BASE_URL` in the respective client.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/gemini/client.ts` | countTokens probe → quota headers → token estimate |
| Create | `src/lib/tmapi/client.ts` | Balance endpoint → USD credit |
| Create | `src/lib/modal/client.ts` | Balance endpoint → USD credit |
| Modify | `src/lib/axiom/events.ts` | Add `logApiBalance` event type |
| Create | `src/app/api/cron/fetch-api-balances/route.ts` | Cron: call all three clients, write to Axiom + ledger |
| Modify | `vercel.json` | Add `0 */6 * * *` schedule for new cron |
| Modify | `.env` | Add `GEMINI_API_KEY`, `TMAPI_API_KEY`, `MODAL_TOKEN` |

---

## Task 1: Add env vars

**Files:**
- Modify: `.env`

- [ ] **Step 1: Add the three new keys to `.env`**

```bash
# --- Google AI Studio (Gemini) ---
GEMINI_API_KEY="your-gemini-api-key"

# --- TMAPI / 1688 ---
TMAPI_API_KEY="your-tmapi-key"

# --- Modal (GPU) ---
MODAL_TOKEN="your-modal-token"
```

> Get Gemini key: aistudio.google.com → Get API key
> Get TMAPI key: your TMAPI dashboard → API Keys
> Get Modal token: `modal token new` in your terminal OR Modal dashboard → Settings → API tokens

- [ ] **Step 2: Commit**

```bash
git add .env
git commit -m "chore: add api keys for gemini, tmapi, modal balance fetching"
```

---

## Task 2: Gemini client

**Files:**
- Create: `src/lib/gemini/client.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/gemini/client.ts

export interface GeminiQuotaResult {
  /** Tokens remaining this minute (from rate-limit header) */
  remainingTokensPerMinute: number
  /** Total token limit per minute */
  limitTokensPerMinute: number
  /** Quota health 0–1 (remaining / limit) */
  quotaHealth: number
  /** Estimated cumulative input tokens probed (always 1 — just the probe itself) */
  probeTokenCount: number
}

/**
 * Makes a free countTokens call to Gemini to probe rate-limit headers.
 * countTokens does not generate content and costs $0.
 *
 * Returns remaining token quota for the current minute window.
 * Use this for "API health" monitoring rather than exact USD billing.
 */
export async function probeGeminiQuota(): Promise<GeminiQuotaResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — skipping Gemini probe')
    return null
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:countTokens?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: '.' }] }] }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini countTokens error: ${res.status} ${text}`)
  }

  const data = await res.json()

  const remaining = Number(res.headers.get('x-ratelimit-remaining-tokens') ?? 0)
  const limit = Number(res.headers.get('x-ratelimit-limit-tokens') ?? 1)

  return {
    remainingTokensPerMinute: remaining,
    limitTokensPerMinute: limit,
    quotaHealth: limit > 0 ? remaining / limit : 1,
    probeTokenCount: Number(data.totalTokens ?? 1),
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gemini/client.ts
git commit -m "feat: gemini quota probe client"
```

---

## Task 3: TMAPI client

**Files:**
- Create: `src/lib/tmapi/client.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/tmapi/client.ts

export interface TmapiBalance {
  /** USD credit balance */
  balance: number
  /** Raw response for debugging */
  raw: unknown
}

/**
 * Fetches the current TMAPI credit balance.
 *
 * Endpoint to verify: open TMAPI dashboard → Network tab → look for a
 * /balance or /user/info request and update BASE_URL + path below if needed.
 */
export async function fetchTmapiBalance(): Promise<TmapiBalance | null> {
  const apiKey = process.env.TMAPI_API_KEY
  if (!apiKey) {
    console.warn('TMAPI_API_KEY not set — skipping TMAPI balance fetch')
    return null
  }

  const res = await fetch('https://api.tmapi.io/api/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TMAPI balance API error: ${res.status} ${text}`)
  }

  const data = await res.json()

  // Common response shapes: { balance: 12.34 } or { data: { balance: 12.34 } } or { credits: 12.34 }
  const balance = Number(
    data?.balance ?? data?.data?.balance ?? data?.credits ?? data?.data?.credits ?? 0
  )

  return { balance, raw: data }
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tmapi/client.ts
git commit -m "feat: tmapi balance client"
```

---

## Task 4: Modal client

**Files:**
- Create: `src/lib/modal/client.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/modal/client.ts

export interface ModalBalance {
  /** USD credit balance */
  balance: number
  /** Raw response for debugging */
  raw: unknown
}

/**
 * Fetches the Modal workspace credit balance via the Modal REST API.
 *
 * Token format: "ak-xxxx" from Modal dashboard → Settings → API Tokens.
 * Endpoint to verify: if this returns 404, open Modal dashboard → Network tab
 * and look for a credits/balance request, then update the path below.
 */
export async function fetchModalBalance(): Promise<ModalBalance | null> {
  const token = process.env.MODAL_TOKEN
  if (!token) {
    console.warn('MODAL_TOKEN not set — skipping Modal balance fetch')
    return null
  }

  const res = await fetch('https://api.modal.com/v1/workspaces/current', {
    headers: { Authorization: `Token ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Modal API error: ${res.status} ${text}`)
  }

  const data = await res.json()

  // Adapt to actual response shape — inspect `raw` on first run and update this
  const balance = Number(
    data?.credits ?? data?.balance ?? data?.credit_balance ?? data?.data?.credits ?? 0
  )

  return { balance, raw: data }
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/modal/client.ts
git commit -m "feat: modal balance client"
```

---

## Task 5: Axiom event + fetch-api-balances cron

**Files:**
- Modify: `src/lib/axiom/events.ts`
- Create: `src/app/api/cron/fetch-api-balances/route.ts`

- [ ] **Step 1: Add `logApiBalance` to `src/lib/axiom/events.ts`**

Add this function at the bottom of the file:

```typescript
export async function logApiBalance(data: {
  service: string
  balance: number
  quota_health?: number
}): Promise<void> {
  await ingestEvents([{ _time: new Date().toISOString(), type: 'api_balance', ...data }])
}
```

- [ ] **Step 2: Create `src/app/api/cron/fetch-api-balances/route.ts`**

```typescript
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
        balance: gemini.quotaHealth, // 0–1 quota health ratio
        quota_health: gemini.quotaHealth,
      })
      // Derive USD balance from existing ledger (manual topups - cumulative spend)
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

      // Sync to ledger: insert a snapshot entry so the dashboard balance reflects reality
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

  // Evaluate balance-related alerts
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
```

- [ ] **Step 3: Add `balance_snapshot` to the `api_ledger` balance calculation in `src/app/api/dashboard/route.ts`**

The existing loop sums `topup` and subtracts `spend`. `balance_snapshot` entries should SET the balance, not add to it. Update the loop in `src/app/api/dashboard/route.ts` lines 41–57:

```typescript
for (const service of services) {
  const serviceEntries = ledgerEntries.filter((e) => e.service === service)
  let balance = 0
  let cumSpend = 0
  let todaySpend = 0

  // Find the latest balance_snapshot — use it as the floor if present
  const snapshots = serviceEntries
    .filter((e) => e.entry_type === 'balance_snapshot')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (snapshots.length > 0) {
    // Use latest snapshot as the current balance directly
    balance = Number(snapshots[0].amount)
  } else {
    // Fall back to topup - spend calculation
    for (const e of serviceEntries) {
      const amt = Number(e.amount)
      if (e.entry_type === 'topup') {
        balance += amt
      } else if (e.entry_type === 'spend') {
        balance -= amt
      }
    }
  }

  // Cumulative spend is always from explicit spend entries
  for (const e of serviceEntries) {
    const amt = Number(e.amount)
    if (e.entry_type === 'spend') {
      cumSpend += amt
      if (new Date(e.created_at).toDateString() === todayStr) {
        todaySpend += amt
      }
    }
  }

  balances[service] = balance
  dailySpend[service] = todaySpend
  cumulativeSpend[service] = cumSpend
}
```

- [ ] **Step 4: Add `balance_snapshot` to the DB schema's `entry_type` comment**

In `src/lib/db/schema.ts`, update the comment on `entry_type`:

```typescript
entry_type: text('entry_type').notNull(), // topup | spend | balance_snapshot
```

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/axiom/events.ts src/app/api/cron/fetch-api-balances/route.ts src/app/api/dashboard/route.ts src/lib/db/schema.ts
git commit -m "feat: fetch-api-balances cron with gemini/tmapi/modal clients"
```

---

## Task 6: Wire up cron schedule

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the new cron to `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-email",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/snapshot-drafts",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/fetch-oxylabs",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/fetch-api-balances",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

> Runs every 6 hours — balance data doesn't need to be realtime.

- [ ] **Step 2: Test locally by hitting the endpoint directly**

With `npm run dev` running:

```bash
curl -H "Authorization: Bearer MY_SUPER_COMPLEX_SECRET_KEY_THAT_IS_AT_LEAST_64_CHARACTERS_LONG" \
  http://localhost:3000/api/cron/fetch-api-balances
```

Expected: `OK` response. Check terminal for any `fetch failed` errors and debug the specific client.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: schedule fetch-api-balances cron every 6h"
```

---

## Debugging Guide

**Gemini headers not present:** Some API key types (paid vs. free) may not return rate-limit headers. If `x-ratelimit-remaining-tokens` is absent, the quota values default to 0/1 — the client still logs but shows 0% health. Check the raw response headers by logging `Object.fromEntries(res.headers)` temporarily.

**TMAPI 401 / 404:** Open your TMAPI dashboard in Chrome, open DevTools Network tab, look for XHR requests to `api.tmapi.io` and copy the actual path. Update `src/lib/tmapi/client.ts` fetch URL accordingly.

**Modal 404:** Same approach — open Modal dashboard network tab. Alternatively, run `modal token show` locally and look for the API domain in the output. Modal's API may require a workspace slug: `https://api.modal.com/v1/workspaces/{slug}/credits`.

**`balance_snapshot` shows wrong value:** The cron inserts a new snapshot row each run. The dashboard takes the _latest_ snapshot. If you want historical trend in Axiom, the `logApiBalance` events are the right place to query.
