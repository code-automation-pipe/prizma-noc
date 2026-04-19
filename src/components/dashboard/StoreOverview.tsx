'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { StoreWithStatus } from '@/types'

interface StoreOverviewProps {
  stores: StoreWithStatus[]
}

const PAGE_SIZE = 20

function HealthIndicator({ health }: { health: StoreWithStatus['health'] }) {
  const configs = {
    healthy: {
      dot: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Healthy',
    },
    warning: {
      dot: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Warning',
    },
    critical: {
      dot: 'bg-destructive',
      text: 'text-destructive',
      label: 'Critical',
    },
  } as const
  const c = configs[health]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono ${c.text}`}>
      <span className={`size-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}

function DraftCount({ count, threshold }: { count: number; threshold: number }) {
  const colorClass =
    count < threshold
      ? 'text-destructive'
      : count < threshold + 5
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground'
  return (
    <span className={`font-mono tabular-nums text-sm font-medium ${colorClass}`}>
      {count.toLocaleString()}
    </span>
  )
}

export function StoreOverview({ stores }: StoreOverviewProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = stores.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">
          Store Overview
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            {filtered.length} stores
          </span>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="h-7 w-36 rounded-md border border-input bg-transparent px-2.5 text-xs font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border bg-muted/30">
              <TableHead className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Store
              </TableHead>
              <TableHead className="text-right text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Not Processed
              </TableHead>
              <TableHead className="text-right text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Published Today
              </TableHead>
              <TableHead className="text-right text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Completed Today
              </TableHead>
              <TableHead className="text-right text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Failed Today
              </TableHead>
              <TableHead className="text-right text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Unread
              </TableHead>
              <TableHead className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Email
              </TableHead>
              <TableHead className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground py-2.5">
                Health
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-xs font-mono text-muted-foreground py-10"
                >
                  No stores found
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((store) => (
                <TableRow
                  key={store.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="font-medium text-sm py-3">{store.name}</TableCell>
                  <TableCell className="text-right py-3">
                    <DraftCount
                      count={store.last_draft_count}
                      threshold={store.draft_alert_threshold}
                    />
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <span className={`font-mono tabular-nums text-sm ${
                      store.published_today === 0
                        ? 'text-destructive'
                        : 'text-foreground'
                    }`}>
                      {store.published_today}
                    </span>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <span className={`font-mono tabular-nums text-sm ${
                      store.items_completed_today > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }`}>
                      {store.items_completed_today.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    <span className={`font-mono tabular-nums text-sm ${
                      store.items_failed_today > 0
                        ? 'text-destructive font-semibold'
                        : 'text-muted-foreground'
                    }`}>
                      {store.items_failed_today.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right py-3">
                    {store.unread_message_count > 0 ? (
                      <span className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {store.unread_message_count}
                      </span>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    {store.email_screener_connected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                        Connected
                      </span>
                    ) : (
                      <Link
                        href="/settings"
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                        Set up →
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <HealthIndicator health={store.health} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs font-mono"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs font-mono"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
