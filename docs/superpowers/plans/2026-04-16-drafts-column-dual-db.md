# Drafts Column — Dual DB Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Drafts column in Store Overview to show `COUNT(products WHERE uploaded_at IS NULL) - COUNT(product_workflow WHERE status != 'UPLOADED')` per shop — i.e. items that exist in the scrape DB but haven't entered the pipeline yet.

**Architecture:** Two separate Neon databases are used by the pipeline. `WORKERS_DATABASE_URL` points to the `product_workflow` DB (pipeline status: READY/PROCESSING/QUESTION/UPLOADED). A new `PRODUCTS_DATABASE_URL` points to the `products` DB (raw scrape data with `uploaded_at`, `pipeline_ended_at`, etc.). The dashboard fetches both counts and subtracts to get "waiting to enter pipeline". `getPipelineSpend()` and `getPublishedTodayPerShop()` also need to move to the products DB connection.

**Tech Stack:** Next.js 16 App Router · `@neondatabase/serverless` (`neon()`) · TypeScript · Drizzle-free raw SQL via tagged template literals

---

## File Map

| File | Change |
|------|--------|
| `src/lib/db/workers-db.ts` | Add `productsSQL` connection; split functions by DB; fix `getDraftStatePerShop` to query `product_workflow` |
| `src/app/api/dashboard/route.ts` | Accept two separate counts; compute Drafts = productsNotUploaded − workflowNotUploaded |
| `.env.local` (manual) | Add `PRODUCTS_DATABASE_URL` — not edited by this plan |

---

## Task 1: Add PRODUCTS_DATABASE_URL and second DB connection

**Files:**
- Modify: `src/lib/db/workers-db.ts:1-3`

- [ ] **Step 1: Add `productsSQL` connection alongside existing `workersSQL`**

Replace the top of `src/lib/db/workers-db.ts`:

```typescript
import { neon } from '@neondatabase/serverless'

// product_workflow DB — pipeline status (READY / PROCESSING / QUESTION / UPLOADED)
const workersSQL = neon(process.env.WORKERS_DATABASE_URL!)

// products DB — raw scrape data (uploaded_at, pipeline_ended_at, pipeline_cost_usd, …)
const productsSQL = neon(process.env.PRODUCTS_DATABASE_URL!)
```

- [ ] **Step 2: Add env var to `.env.local`**

Add to `.env.local`:
```
PRODUCTS_DATABASE_URL=postgresql://...connection string for the products DB...
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/workers-db.ts
git commit -m "chore: add productsSQL connection for products DB"
```

---

## Task 2: Fix `getDraftCountsPerShop`, `getPipelineSpend`, `getPublishedTodayPerShop` to use `productsSQL`

These three functions all query the `products` table, which lives in the products DB, not the workflow DB. `workersSQL` currently points to the workflow DB so they are hitting the wrong DB.

**Files:**
- Modify: `src/lib/db/workers-db.ts:15-83`

- [ ] **Step 1: Switch all three functions to use `productsSQL`**

Replace the three functions (keep `getDraftCountsPerShop`, `getPipelineSpend`, `getPublishedTodayPerShop` identical in logic, just change the SQL tag from `workersSQL` to `productsSQL`):

```typescript
/**
 * Reads draft counts from the products table.
 * Drafts = products where uploaded_at IS NULL (not yet sent to Etsy).
 */
export async function getDraftCountsPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE uploaded_at IS NULL
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}

export interface PipelineSpend {
  today_usd: number
  cumulative_usd: number
  today_tokens_in: number
  today_tokens_out: number
}

/**
 * Reads pipeline spend from the products table (products DB).
 * Uses a rolling 24h window for "today".
 */
export async function getPipelineSpend(): Promise<PipelineSpend> {
  const [todayRows, allRows] = await Promise.all([
    productsSQL`
      SELECT
        COALESCE(SUM(pipeline_cost_usd), 0)::float   AS total_usd,
        COALESCE(SUM(pipeline_tokens_in), 0)::int    AS tokens_in,
        COALESCE(SUM(pipeline_tokens_out), 0)::int   AS tokens_out
      FROM products
      WHERE pipeline_ended_at >= NOW() - INTERVAL '24 hours'
        AND pipeline_cost_usd IS NOT NULL
    `,
    productsSQL`
      SELECT
        COALESCE(SUM(pipeline_cost_usd), 0)::float AS total_usd
      FROM products
      WHERE pipeline_cost_usd IS NOT NULL
    `,
  ])

  return {
    today_usd:        Number(todayRows[0]?.total_usd  ?? 0),
    cumulative_usd:   Number(allRows[0]?.total_usd    ?? 0),
    today_tokens_in:  Number(todayRows[0]?.tokens_in  ?? 0),
    today_tokens_out: Number(todayRows[0]?.tokens_out ?? 0),
  }
}

/**
 * Returns count of products uploaded to Etsy today (calendar day).
 */
export async function getPublishedTodayPerShop(): Promise<DraftCount[]> {
  const rows = await productsSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM products
    WHERE uploaded_at >= DATE_TRUNC('day', NOW())
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/workers-db.ts
git commit -m "fix: route products-table queries to productsSQL connection"
```

---

## Task 3: Fix `getDraftStatePerShop` to query `product_workflow` via `workersSQL`

`getDraftStatePerShop` currently queries the `products` table. It should query `product_workflow` (the workflow DB, `workersSQL`) to count items in the pipeline that aren't yet uploaded.

**Files:**
- Modify: `src/lib/db/workers-db.ts:85-101`

- [ ] **Step 1: Rewrite `getDraftStatePerShop` to use `workersSQL` + `product_workflow` table**

```typescript
/**
 * Returns count of items currently in the pipeline and not yet uploaded.
 * Source: product_workflow table (workflow DB).
 * status values: READY | PROCESSING | QUESTION | UPLOADED
 */
export async function getDraftStatePerShop(): Promise<DraftCount[]> {
  const rows = await workersSQL`
    SELECT shop_id, COUNT(*)::int AS draft_count
    FROM product_workflow
    WHERE status != 'UPLOADED'
    GROUP BY shop_id
  `
  return rows.map((r) => ({
    shop_id: Number(r.shop_id),
    draft_count: Number(r.draft_count),
  }))
}
```

> **Note:** If `product_workflow` uses a different column name than `shop_id`, adjust here. Check your Neon Studio for the workflow DB table schema.

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/workers-db.ts
git commit -m "fix: getDraftStatePerShop queries product_workflow via workersSQL"
```

---

## Task 4: Compute Drafts = productsNotUploaded − workflowNotUploaded in dashboard route

The dashboard currently uses `draftStateCounts` directly as the Drafts value. Now Drafts = products(uploaded_at IS NULL) − product_workflow(status != 'UPLOADED') per shop.

**Files:**
- Modify: `src/app/api/dashboard/route.ts`

- [ ] **Step 1: Add `getDraftCountsPerShop` to the parallel fetch**

In `src/app/api/dashboard/route.ts`, import `getDraftCountsPerShop` and add it to the `Promise.all`:

```typescript
import { getPublishedTodayPerShop, getDraftStatePerShop, getPipelineSpend, getDraftCountsPerShop } from '@/lib/db/workers-db'
```

Replace the `Promise.all` destructure (currently lines ~12-31) to include `productCounts`:

```typescript
const [
  allStores,
  unreadCounts,
  recentAlerts,
  ledgerEntries,
  pipelineSpend,
  publishedCounts,
  draftStateCounts,
  productCounts,
] = await Promise.all([
  db.query.stores.findMany({ orderBy: (s, { asc }) => asc(s.name) }),
  db
    .select({ store_id: etsy_messages.store_id, count: count() })
    .from(etsy_messages)
    .where(eq(etsy_messages.is_read, false))
    .groupBy(etsy_messages.store_id),
  db.query.triggered_alerts.findMany({
    orderBy: desc(triggered_alerts.triggered_at),
    limit: 50,
  }),
  db.query.api_ledger.findMany({ orderBy: desc(api_ledger.created_at) }),
  getPipelineSpend().catch((e) => { console.error('[workers-db] getPipelineSpend failed:', e); return null }),
  getPublishedTodayPerShop().catch((e) => { console.error('[workers-db] getPublishedTodayPerShop failed:', e); return [] }),
  getDraftStatePerShop().catch((e) => { console.error('[workers-db] getDraftStatePerShop failed:', e); return [] }),
  getDraftCountsPerShop().catch((e) => { console.error('[workers-db] getDraftCountsPerShop failed:', e); return [] }),
])
```

- [ ] **Step 2: Build the Drafts map using the subtraction**

After the existing `publishedMap` / `draftStateMap` lines, add:

```typescript
const productCountMap = new Map(productCounts.map((p) => [p.shop_id, p.draft_count]))
const draftStateMap   = new Map(draftStateCounts.map((d) => [d.shop_id, d.draft_count]))
```

Then in the per-store mapping, replace how `draftsState` is computed:

```typescript
const totalNotUploaded  = productCountMap.get(s.shop_id) ?? 0
const inPipeline        = draftStateMap.get(s.shop_id) ?? 0
const draftsState       = Math.max(0, totalNotUploaded - inPipeline)
```

- [ ] **Step 3: Verify the existing `publishedMap` line is still correct**

Ensure these lines are present and unchanged:

```typescript
const publishedMap = new Map(publishedCounts.map((p) => [p.shop_id, p.draft_count]))
```

And in the store mapping:
```typescript
const publishedToday = publishedMap.get(s.shop_id) ?? 0
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/route.ts
git commit -m "feat: drafts column = products(not uploaded) - product_workflow(in pipeline)"
```

---

## Task 5: Smoke test

- [ ] **Step 1: Restart dev server** (env vars only load at startup)

```bash
# Stop existing server, then:
npm run dev
```

- [ ] **Step 2: Open dashboard and verify**

Navigate to `http://localhost:3000`. Confirm:
- **Not Processed** — unchanged (still from `stores.last_draft_count`)
- **Drafts** — shows a value ≤ Not Processed (items not yet in pipeline)
- **Processed Today** — shows published count (0 is red)
- No `[workers-db]` errors in the terminal

- [ ] **Step 3: Check server terminal for errors**

If you see `[workers-db] getDraftStatePerShop failed` with `relation "product_workflow" does not exist`, check the column name in your workflow DB's Neon Studio and update the table name in `getDraftStatePerShop`.

If you see `[workers-db] getDraftCountsPerShop failed`, check that `PRODUCTS_DATABASE_URL` is set correctly and the `products` table exists in that DB.
