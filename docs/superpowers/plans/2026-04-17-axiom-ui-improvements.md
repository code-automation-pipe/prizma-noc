# Axiom Data Preview + UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Complete `2026-04-17-security-vercel-readiness.md` first.

**Goal:** Make chart data explorable with date-range control, surface a missing Drafts trend chart, improve store health logic to include draft counts, and add an at-a-glance summary stats bar.

**Architecture:** Date range stored as local state in `GraphsSection`; passed as `?days=N` query param to chart routes which re-query Axiom. `computeStoreHealth` gains draft-count awareness. A new `SummaryStats` component aggregates totals from `DashboardData` already in memory. No new API endpoints needed.

**Tech Stack:** Next.js 15 App Router · TanStack Query · Recharts · TypeScript

---

## File Map

| Path | Action | Purpose |
|------|--------|---------|
| `src/app/api/charts/published/route.ts` | Modify | Accept `?days=N` param |
| `src/app/api/charts/messages/route.ts` | Modify | Accept `?days=N` param |
| `src/app/api/charts/drafts/route.ts` | Modify | Accept `?days=N` param, extend to 30d default |
| `src/lib/health.ts` | Modify | Add draft count + threshold to health logic |
| `src/app/api/dashboard/route.ts` | Modify | Pass draft args to `computeStoreHealth` |
| `src/components/dashboard/GraphsSection.tsx` | Modify | Date range selector + Drafts tab |
| `src/components/dashboard/SummaryStats.tsx` | Create | At-a-glance totals bar |
| `src/components/dashboard/DashboardClient.tsx` | Modify | Add `<SummaryStats>` above `<ApiWallet>` |

---

### Task 1: Update chart routes to accept `?days=N`

**Files:**
- Modify: `src/app/api/charts/published/route.ts`
- Modify: `src/app/api/charts/messages/route.ts`
- Modify: `src/app/api/charts/drafts/route.ts`

The `revalidate` export is replaced with `dynamic = 'force-dynamic'` so Next.js does not collapse different `?days=` values into a single cached response.

- [ ] **Step 1: Update published route**

Replace the entire content of `src/app/api/charts/published/route.ts`:

```typescript
// src/app/api/charts/published/route.ts
import { type NextRequest } from 'next/server'
import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    const apl = `
['${DATASET}']
| where type == 'products_published'
| where _time > ago(${days}d)
| summarize total = max(count) by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    return Response.json(normalizeAxiomResult(result))
  } catch (err) {
    console.error('[charts/published]', err)
    return Response.json([])
  }
}
```

- [ ] **Step 2: Update messages route**

Replace the entire content of `src/app/api/charts/messages/route.ts`:

```typescript
// src/app/api/charts/messages/route.ts
import { type NextRequest } from 'next/server'
import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    const apl = `
['${DATASET}']
| where type == 'message_received'
| where _time > ago(${days}d)
| summarize message_count = count() by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    return Response.json(normalizeAxiomResult(result))
  } catch (err) {
    console.error('[charts/messages]', err)
    return Response.json([])
  }
}
```

- [ ] **Step 3: Update drafts route**

Replace the entire content of `src/app/api/charts/drafts/route.ts`:

```typescript
// src/app/api/charts/drafts/route.ts
import { type NextRequest } from 'next/server'
import { queryAxiom, normalizeAxiomResult, DATASET } from '@/lib/axiom/client'

export const dynamic = 'force-dynamic'

function parseDays(req: NextRequest, def: number): number {
  const raw = req.nextUrl.searchParams.get('days')
  const n = raw ? parseInt(raw, 10) : def
  return Number.isFinite(n) ? Math.min(60, Math.max(7, n)) : def
}

export async function GET(request: NextRequest) {
  const days = parseDays(request, 30)
  try {
    const apl = `
['${DATASET}']
| where type == 'draft_snapshot'
| where _time > ago(${days}d)
| summarize draft_count = avg(draft_count) by bin(_time, 1d), store_name
| order by _time asc
    `.trim()

    const result = await queryAxiom(apl)
    return Response.json(normalizeAxiomResult(result))
  } catch (err) {
    console.error('[charts/drafts]', err)
    return Response.json([])
  }
}
```

- [ ] **Step 4: Test routes manually**

```bash
# With dev server running and session cookie set (log in first):
curl -b "session=$DASHBOARD_PASSWORD" "http://localhost:3000/api/charts/published?days=7"
curl -b "session=$DASHBOARD_PASSWORD" "http://localhost:3000/api/charts/drafts?days=30"
# Expected: JSON arrays (empty is fine if no Axiom data in dev)
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/charts/published/route.ts \
        src/app/api/charts/messages/route.ts \
        src/app/api/charts/drafts/route.ts
git commit -m "feat: chart routes accept ?days=N (7–60) for date range control"
```

---

### Task 2: Date range selector + Drafts tab in GraphsSection

**Files:**
- Modify: `src/components/dashboard/GraphsSection.tsx`

This task replaces the entire file. Key changes:
- `days` state (7 | 30 | 60, default 30)
- All chart queries include `?days=${days}` and re-fetch on `days` change
- New "Drafts Over Time" tab
- Date label uses `toLocaleDateString('en-GB', { day:'numeric', month:'short' })`

- [ ] **Step 1: Replace GraphsSection**

```typescript
// src/components/dashboard/GraphsSection.tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

const CHART_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

const RANGE_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
] as const

function ChartSkeleton() {
  return <Skeleton className="w-full h-64" />
}

function formatDate(val: unknown): string {
  try {
    return new Date(String(val)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return String(val ?? '')
  }
}

function formatUSD(value: unknown): string {
  return `$${Number(value).toFixed(4)}`
}

interface GraphsSectionProps {
  storeNames: string[]
}

export function GraphsSection({ storeNames }: GraphsSectionProps) {
  const [days, setDays] = useState<7 | 30 | 60>(30)

  const { data: publishedData = [], isLoading: publishedLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'published', days],
    queryFn: () => fetch(`/api/charts/published?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: messagesData = [], isLoading: messagesLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'messages', days],
    queryFn: () => fetch(`/api/charts/messages?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: draftsData = [], isLoading: draftsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'drafts', days],
    queryFn: () => fetch(`/api/charts/drafts?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: apiCostData, isLoading: apiCostLoading } = useQuery<{
    daily: Record<string, unknown>[]
    cumulative: Record<string, unknown>[]
  }>({
    queryKey: ['charts', 'api-cost'],
    queryFn: () => fetch('/api/charts/api-cost').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: oxylabsData = [], isLoading: oxylabsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'oxylabs'],
    queryFn: () => fetch('/api/charts/oxylabs').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const storeNameSet = new Set(storeNames)
  const publishedStoreNames = [...new Set(publishedData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const msgStoreNames = [...new Set(messagesData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const draftsStoreNames = [...new Set(draftsData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))

  const publishedByTime = groupByTime(publishedData, '_time', 'store_name', 'total')
  const messagesByTime = groupByTime(messagesData, '_time', 'store_name', 'message_count')
  const draftsByTime = groupByTime(draftsData, '_time', 'store_name', 'draft_count')

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Trends</h2>
        <div className="flex items-center gap-1 rounded-md border border-input bg-background p-0.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                days === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="published">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="api-cost-daily">API Cost (Daily)</TabsTrigger>
          <TabsTrigger value="api-cost-cumulative">API Cost (Cumul.)</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="oxylabs">OxyLabs</TabsTrigger>
        </TabsList>

        <TabsContent value="published">
          {publishedLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={publishedByTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDate} />
                <Legend />
                {publishedStoreNames.slice(0, 10).map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="drafts">
          {draftsLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={draftsByTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDate} formatter={(v) => [Number(v).toFixed(0), '']} />
                <Legend />
                {draftsStoreNames.slice(0, 10).map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    dot={false}
                    strokeWidth={1.5}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="api-cost-daily">
          {apiCostLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={apiCostData?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                <Tooltip formatter={(v) => [formatUSD(v), '']} />
                <Legend />
                <Bar dataKey="gemini" stackId="a" fill={CHART_COLORS[0]} name="Gemini" />
                <Bar dataKey="tmapi" stackId="a" fill={CHART_COLORS[1]} name="TMAPI" />
                <Bar dataKey="modal" stackId="a" fill={CHART_COLORS[2]} name="Modal" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="api-cost-cumulative">
          {apiCostLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={apiCostData?.cumulative ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                <Tooltip formatter={(v) => [formatUSD(v), '']} />
                <Legend />
                <Line type="monotone" dataKey="gemini_cumulative" stroke={CHART_COLORS[0]} dot={false} name="Gemini" />
                <Line type="monotone" dataKey="tmapi_cumulative" stroke={CHART_COLORS[1]} dot={false} name="TMAPI" />
                <Line type="monotone" dataKey="modal_cumulative" stroke={CHART_COLORS[2]} dot={false} name="Modal" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="messages">
          {messagesLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={messagesByTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDate} />
                <Legend />
                {msgStoreNames.slice(0, 10).map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="oxylabs">
          {oxylabsLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={oxylabsData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Requests']} />
                <Legend />
                <Bar dataKey="requests" fill={CHART_COLORS[3]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}

function groupByTime(
  rows: Record<string, unknown>[],
  timeField: string,
  groupField: string,
  valueField: string,
): Record<string, unknown>[] {
  const byTime = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const time = String(row[timeField] ?? '')
    const group = String(row[groupField] ?? 'unknown')
    const value = Number(row[valueField] ?? 0)
    if (!byTime.has(time)) byTime.set(time, { date: time })
    byTime.get(time)![group] = value
  }
  return Array.from(byTime.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
}
```

- [ ] **Step 2: Verify in browser**

Open the dashboard. In the "Trends" section:
- 7d / 30d / 60d buttons appear top-right of the section header
- Clicking a range button re-fetches all charts
- "Drafts" tab appears and renders a line chart (may be empty if no Axiom data)
- API Cost tooltips show `$0.0000` formatted values

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/GraphsSection.tsx
git commit -m "feat: date range selector (7/30/60d) + Drafts trend tab in GraphsSection"
```

---

### Task 3: Improve store health logic

**Files:**
- Modify: `src/lib/health.ts`
- Modify: `src/app/api/dashboard/route.ts`

Currently `computeStoreHealth` returns `critical` for any store without email connected, regardless of draft state. The new logic:
- `critical` = email not connected
- `warning` = email connected, but `draftCount < threshold`
- `healthy` = email connected and `draftCount >= threshold`

- [ ] **Step 1: Write the failing test**

There's no test framework set up — verify via the browser instead. Note the current health values for a connected store with low drafts (should be `healthy` now, will become `warning` after).

- [ ] **Step 2: Update `src/lib/health.ts`**

Replace the entire file:

```typescript
// src/lib/health.ts
export type StoreHealth = 'healthy' | 'warning' | 'critical'

export function computeStoreHealth(
  emailScreenerConnected: boolean,
  draftCount: number,
  draftAlertThreshold: number,
): StoreHealth {
  if (!emailScreenerConnected) return 'critical'
  if (draftCount < draftAlertThreshold) return 'warning'
  return 'healthy'
}
```

- [ ] **Step 3: Update the call in `src/app/api/dashboard/route.ts`**

Find line 151 in `src/app/api/dashboard/route.ts`:
```typescript
health: computeStoreHealth(emailScreenerConnected),
```

Replace with:
```typescript
health: computeStoreHealth(emailScreenerConnected, notProcessed ?? 0, s.draft_alert_threshold),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 5: Verify in browser**

Reload dashboard. Stores with email connected but 0 drafts should now show `warning` instead of `healthy`. TopBar system health badge updates accordingly.

- [ ] **Step 6: Commit**

```bash
git add src/lib/health.ts src/app/api/dashboard/route.ts
git commit -m "feat: health logic includes draft count — warning when drafts below threshold"
```

---

### Task 4: Summary stats bar

**Files:**
- Create: `src/components/dashboard/SummaryStats.tsx`
- Modify: `src/components/dashboard/DashboardClient.tsx`

- [ ] **Step 1: Create SummaryStats component**

```typescript
// src/components/dashboard/SummaryStats.tsx
import type { DashboardData } from '@/types'

interface SummaryStatsProps {
  data: DashboardData
}

export function SummaryStats({ data }: SummaryStatsProps) {
  const totalDrafts = data.stores.reduce((sum, s) => sum + s.last_draft_count, 0)
  const totalPublished = data.stores.reduce((sum, s) => sum + s.published_today, 0)
  const totalUnread = data.stores.reduce((sum, s) => sum + s.unread_message_count, 0)
  const totalSpendToday = Object.values(data.ledger.daily_spend).reduce((sum, v) => sum + v, 0)

  const stats = [
    {
      label: 'Not Processed',
      value: totalDrafts.toLocaleString(),
      className: totalDrafts === 0 ? 'text-destructive' : '',
    },
    {
      label: 'Published Today',
      value: totalPublished.toLocaleString(),
      className: totalPublished > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive',
    },
    {
      label: 'Unread Messages',
      value: totalUnread.toLocaleString(),
      className: totalUnread > 0 ? 'text-amber-600 dark:text-amber-400' : '',
    },
    {
      label: 'API Spend Today',
      value: `$${totalSpendToday.toFixed(4)}`,
      className: '',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className={`text-2xl font-bold mt-0.5 tabular-nums ${stat.className}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add SummaryStats to DashboardClient**

In `src/components/dashboard/DashboardClient.tsx`, add the import and render `<SummaryStats data={data} />` between `<TopBar .../>` and `<ApiWallet .../>`.

Replace the `return (...)` block with:

```typescript
return (
  <div className="flex flex-col gap-6 p-6 max-w-screen-2xl mx-auto">
    <TopBar
      stores={data.stores}
      lastRefreshed={dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : data.last_refreshed}
      onRefresh={() => refetch()}
    />
    <SummaryStats data={data} />
    <ApiWallet ledger={data.ledger} />
    <StoreOverview stores={data.stores} />
    <MessagesFeed stores={data.stores} />
    <GraphsSection storeNames={data.stores.map((s) => s.name)} />
    <AlertsFeed alerts={data.recent_alerts} />
  </div>
)
```

And add the import at the top:
```typescript
import { SummaryStats } from './SummaryStats'
```

- [ ] **Step 3: Verify in browser**

Four stat cards appear below the TopBar: "Not Processed", "Published Today", "Unread Messages", "API Spend Today". Colors are red for zero-published, amber for unread messages > 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/SummaryStats.tsx src/components/dashboard/DashboardClient.tsx
git commit -m "feat: summary stats bar — totals at a glance above API wallet"
```

---

### Task 5: Final build + UI review

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 2: Production build**

```bash
npm run build
# Expected: exits 0
```

- [ ] **Step 3: Manual UI walkthrough**

With dev server running, verify:
- [ ] Summary stats bar shows correct totals
- [ ] Drafts tab in Trends shows line chart (or empty state if no Axiom data)
- [ ] Date range buttons switch 7d / 30d / 60d and charts refetch
- [ ] Stores with email connected + low drafts show `warning` health badge
- [ ] TopBar system badge reflects new warning counts

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Axiom data improvements + UI — date range, drafts chart, summary stats, health logic"
```

---

## Optional: UI Redesign with frontend-design skill

For a more thorough visual overhaul (typography, spacing, card design, dark mode polish), invoke the `frontend-design` skill after completing the above tasks:

```
/frontend-design
Redesign the Etsy Monitor dashboard components for a production-grade look.
Target files:
  - src/components/dashboard/DashboardClient.tsx (layout + spacing)
  - src/components/dashboard/SummaryStats.tsx (card design)
  - src/components/dashboard/ApiWallet.tsx (card grid)
  - src/components/dashboard/StoreOverview.tsx (table + health badges)
  - src/app/login/page.tsx (login screen polish)
Design goals: clean monochrome base, clear data hierarchy, status colors (green/amber/red only for meaning), works well in both light and dark mode.
```
