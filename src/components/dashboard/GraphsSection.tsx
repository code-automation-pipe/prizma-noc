'use client'

import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

const CHART_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

function ChartSkeleton() {
  return <Skeleton className="w-full h-64" />
}

function formatDateLabel(val: unknown): string {
  try { return new Date(String(val)).toLocaleDateString() } catch { return String(val ?? '') }
}

export function GraphsSection() {
  const { data: draftsData = [], isLoading: draftsLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'drafts'],
    queryFn: () => fetch('/api/charts/drafts').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: publishedData = [], isLoading: publishedLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'published'],
    queryFn: () => fetch('/api/charts/published').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: messagesData = [], isLoading: messagesLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['charts', 'messages'],
    queryFn: () => fetch('/api/charts/messages').then((r) => r.json()),
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

  const draftStoreNames = [...new Set(draftsData.map((d) => String(d.store_name ?? '')))].filter(Boolean)
  const publishedStoreNames = [...new Set(publishedData.map((d) => String(d.store_name ?? '')))].filter(Boolean)
  const msgStoreNames = [...new Set(messagesData.map((d) => String(d.store_name ?? '')))].filter(Boolean)

  const draftsByTime = groupByTime(draftsData, '_time', 'store_name', 'draft_count')
  const publishedByTime = groupByTime(publishedData, '_time', 'store_name', 'total')
  const messagesByTime = groupByTime(messagesData, '_time', 'store_name', 'count()')

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Trends</h2>
      <Tabs defaultValue="drafts">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="drafts">Drafts Over Time</TabsTrigger>
          <TabsTrigger value="published">Published Per Day</TabsTrigger>
          <TabsTrigger value="api-cost-daily">API Cost (Daily)</TabsTrigger>
          <TabsTrigger value="api-cost-cumulative">API Cost (Cumulative)</TabsTrigger>
          <TabsTrigger value="messages">Messages Per Day</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts">
          {draftsLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={draftsByTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDateLabel} />
                <Legend />
                {draftStoreNames.slice(0, 10).map((name, i) => (
                  <Line key={String(name)} type="monotone" dataKey={String(name)} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="published">
          {publishedLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={publishedByTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDateLabel} />
                <Legend />
                {publishedStoreNames.slice(0, 10).map((name, i) => (
                  <Bar key={String(name)} dataKey={String(name)} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="api-cost-daily">
          {apiCostLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={apiCostData?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={formatDateLabel} />
                <Legend />
                {msgStoreNames.slice(0, 10).map((name, i) => (
                  <Bar key={String(name)} dataKey={String(name)} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
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
  valueField: string
): Record<string, unknown>[] {
  const byTime = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const time = String(row[timeField] ?? '')
    const group = String(row[groupField] ?? 'unknown')
    const value = Number(row[valueField] ?? 0)
    if (!byTime.has(time)) byTime.set(time, { date: time })
    byTime.get(time)![group] = value
  }
  return Array.from(byTime.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  )
}
