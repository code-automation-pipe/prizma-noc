'use client'

import { useQuery } from '@tanstack/react-query'
import type { DashboardData } from '@/types'
import { TopBar } from './TopBar'
import { SummaryStats } from './SummaryStats'
import { ApiWallet } from './ApiWallet'
import { StoreOverview } from './StoreOverview'
import { MessagesFeed } from './MessagesFeed'
import { GraphsSection } from './GraphsSection'
import { AlertsFeed } from './AlertsFeed'

interface DashboardClientProps {
  initialData: DashboardData | null
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/dashboard').then((r) => r.json()),
    initialData: initialData ?? undefined,
    refetchInterval: 2 * 60 * 1000, // auto-refresh every 2 minutes
  })

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Loading dashboard…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-destructive">
        Failed to load dashboard. Check your environment variables.
      </div>
    )
  }

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
}
