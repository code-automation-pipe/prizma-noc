'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
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

function HealthBadge({ health }: { health: StoreWithStatus['health'] }) {
  const variants = {
    healthy: 'default',
    warning: 'secondary',
    critical: 'destructive',
  } as const
  return <Badge variant={variants[health]}>{health}</Badge>
}

function DraftBadge({ count, threshold }: { count: number; threshold: number }) {
  const color =
    count < threshold
      ? 'text-destructive font-semibold'
      : count < threshold + 5
        ? 'text-yellow-600 font-semibold'
        : 'text-green-600'
  return <span className={color}>{count}</span>
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
        <h2 className="text-lg font-semibold">Store Overview</h2>
        <span className="text-sm text-muted-foreground">{filtered.length} stores</span>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Search stores…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">Drafts</TableHead>
              <TableHead className="text-right">Published Today</TableHead>
              <TableHead className="text-right">Unread Messages</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No stores found
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((store) => (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell className="text-right">
                    <DraftBadge
                      count={store.last_draft_count}
                      threshold={store.draft_alert_threshold}
                    />
                  </TableCell>
                  <TableCell className="text-right">{store.published_today}</TableCell>
                  <TableCell className="text-right">
                    {store.unread_message_count > 0 ? (
                      <Badge variant="destructive">{store.unread_message_count}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <HealthBadge health={store.health} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
