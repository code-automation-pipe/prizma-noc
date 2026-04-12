'use client'

import { formatDistanceToNow } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { StoreWithStatus } from '@/types'

interface TopBarProps {
  stores: StoreWithStatus[]
  lastRefreshed: string
  onRefresh: () => void
}

export function TopBar({ stores, lastRefreshed, onRefresh }: TopBarProps) {
  const criticalCount = stores.filter((s) => s.health === 'critical').length
  const warningCount = stores.filter((s) => s.health === 'warning').length

  const systemHealth =
    criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy'

  const healthLabel =
    systemHealth === 'critical'
      ? `${criticalCount} Critical`
      : systemHealth === 'warning'
        ? `${warningCount} Warning`
        : 'All Healthy'

  const healthVariant =
    systemHealth === 'critical'
      ? 'destructive'
      : systemHealth === 'warning'
        ? 'secondary'
        : 'default'

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })
    } catch {
      return 'just now'
    }
  })()

  return (
    <div className="flex items-center justify-between gap-4 border-b pb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Etsy Monitor</h1>
        <Badge variant={healthVariant}>
          <span
            className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
              systemHealth === 'critical'
                ? 'bg-red-500'
                : systemHealth === 'warning'
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
          />
          {healthLabel}
        </Badge>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Updated {timeAgo}</span>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>
    </div>
  )
}
