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
