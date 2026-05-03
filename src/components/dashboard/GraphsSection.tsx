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
  // Lazy-load chart data: only fire fetches for tabs the user actually opens.
  // Each opened tab stays in the set so switching back uses the React Query cache
  // instead of re-firing — saves Neon compute on every dashboard page load.
  const [viewedTabs, setViewedTabs] = useState<Set<string>>(() => new Set(['published']))
  const handleTabChange = (next: string) => {
    setViewedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
  }
  const apiCostViewed = viewedTabs.has('api-cost-daily') || viewedTabs.has('api-cost-cumulative')

  const { data: publishedData = [], isLoading: publishedLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'published', days],
    queryFn: () => fetch(`/api/charts/published?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('published'),
  })

  const { data: messagesData = [], isLoading: messagesLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'messages', days],
    queryFn: () => fetch(`/api/charts/messages?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('messages'),
  })

  const { data: ordersData = [], isLoading: ordersLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'orders', days],
    queryFn: () => fetch(`/api/charts/orders?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('orders'),
  })

  const { data: refundsData = [], isLoading: refundsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'refunds', days],
    queryFn: () => fetch(`/api/charts/refunds?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('refunds'),
  })

  const { data: draftsData = [], isLoading: draftsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'drafts', days],
    queryFn: () => fetch(`/api/charts/drafts?days=${days}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('drafts'),
  })

  const { data: apiCostData, isLoading: apiCostLoading } = useQuery<{
    daily: Record<string, unknown>[]
    cumulative: Record<string, unknown>[]
  }>({
    queryKey: ['charts', 'api-cost'],
    queryFn: () => fetch('/api/charts/api-cost').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: apiCostViewed,
  })

  const { data: oxylabsData = [], isLoading: oxylabsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'oxylabs'],
    queryFn: () => fetch('/api/charts/oxylabs').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: viewedTabs.has('oxylabs'),
  })

  const storeNameSet = new Set(storeNames)
  const publishedStoreNames = [...new Set(publishedData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const msgStoreNames = [...new Set(messagesData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const draftsStoreNames = [...new Set(draftsData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const ordersStoreNames = [...new Set(ordersData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))
  const refundsStoreNames = [...new Set(refundsData.map((d) => String(d.store_name ?? '')))].filter((n) => n && storeNameSet.has(n))

  const publishedByTime = groupByTime(publishedData, '_time', 'store_name', 'total')
  const messagesByTime = groupByTime(messagesData, '_time', 'store_name', 'message_count')
  const draftsByTime = groupByTime(draftsData, '_time', 'store_name', 'draft_count')
  const ordersByTime = groupByTime(ordersData, '_time', 'store_name', 'order_count')
  const refundsByTime = groupByTime(refundsData, '_time', 'store_name', 'refund_count')

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

      <Tabs defaultValue="published" onValueChange={(v) => handleTabChange(String(v))}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="drafts">Not Processed</TabsTrigger>
          <TabsTrigger value="api-cost-daily">Google AI Costs (Daily)</TabsTrigger>
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

        <TabsContent value="orders">
          {ordersLoading ? <ChartSkeleton /> : ordersByTime.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              No orders in the selected window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ordersByTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={formatDate} />
                <Legend />
                {ordersStoreNames.slice(0, 10).map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="refunds">
          {refundsLoading ? <ChartSkeleton /> : refundsByTime.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              No refunds in the selected window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={refundsByTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={formatDate} />
                <Legend />
                {refundsStoreNames.slice(0, 10).map((name, i) => (
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
                <Tooltip labelFormatter={formatDate} formatter={(v, name) => [Number(v).toFixed(0), name]} />
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
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                <Tooltip labelFormatter={formatDate} formatter={(v) => [formatUSD(v), '']} />
                <Legend />
                <Bar dataKey="gemini" fill={CHART_COLORS[0]} name="Google AI" />
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
