'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TriggeredAlertWithRule } from '@/types'

interface AlertsFeedProps {
  alerts: TriggeredAlertWithRule[]
}

const RULE_ICONS: Record<string, typeof AlertCircle> = {
  low_drafts: AlertTriangle,
  api_budget: AlertCircle,
  api_balance: AlertCircle,
  unread_message: Info,
  zero_publishing: AlertTriangle,
}

export function AlertsFeed({ alerts: initialAlerts }: AlertsFeedProps) {
  const [page, setPage] = useState(1)
  const limit = 50

  const { data: alerts = initialAlerts } = useQuery<TriggeredAlertWithRule[]>({
    queryKey: ['alerts', page],
    queryFn: () =>
      fetch(`/api/alerts?page=${page}&limit=${limit}`).then((r) => r.json()),
    initialData: page === 1 ? initialAlerts : undefined,
  })

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Alerts Feed</h2>

      <div className="rounded-md border divide-y">
        {alerts.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No alerts triggered
          </div>
        ) : (
          alerts.map((alert) => {
            const ruleType = alert.rule?.rule_type ?? 'unknown'
            const Icon = RULE_ICONS[ruleType] ?? Info
            const isError = ruleType === 'api_balance' || ruleType === 'low_drafts'

            return (
              <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
                <Icon
                  className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                    isError ? 'text-destructive' : 'text-yellow-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ruleType}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
                </span>
              </div>
            )
          })
        )}
      </div>

      {alerts.length === limit && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
            Load more
          </Button>
        </div>
      )}
    </section>
  )
}
