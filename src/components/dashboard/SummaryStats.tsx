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
      valueClass: totalDrafts === 0 ? 'text-destructive' : 'text-foreground',
      dot: totalDrafts === 0 ? 'bg-destructive' : 'bg-emerald-500',
    },
    {
      label: 'Published Today',
      value: totalPublished.toLocaleString(),
      valueClass: totalPublished > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
      dot: totalPublished > 0 ? 'bg-emerald-500' : 'bg-destructive',
    },
    {
      label: 'Unread Messages',
      value: totalUnread.toLocaleString(),
      valueClass: totalUnread > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
      dot: totalUnread > 0 ? 'bg-amber-500' : 'bg-muted-foreground/30',
    },
    {
      label: 'API Spend Today',
      value: `$${totalSpendToday.toFixed(4)}`,
      valueClass: 'text-foreground',
      dot: 'bg-muted-foreground/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card px-5 py-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block size-1.5 rounded-full shrink-0 ${stat.dot}`} />
            <p className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
              {stat.label}
            </p>
          </div>
          <p className={`text-3xl font-mono font-bold tabular-nums leading-none tracking-tight ${stat.valueClass}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  )
}
