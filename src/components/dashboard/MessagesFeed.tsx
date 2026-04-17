'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { MessageCircle, ShoppingBag } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { StoreWithStatus } from '@/types'

interface Message {
  id: string
  store_id: string
  sender_name: string
  subject: string
  type: string
  received_at: string
  is_read: boolean
}

interface MessagesFeedProps {
  stores: StoreWithStatus[]
}

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'message', label: 'Messages only' },
  { value: 'order', label: 'Orders only' },
]

function TypeBadge({ type }: { type: string }) {
  if (type === 'order') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
        <ShoppingBag className="size-2.5" />
        Order
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
      <MessageCircle className="size-2.5" />
      Message
    </span>
  )
}

function StoreBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium shrink-0 max-w-[100px] truncate">
      {name}
    </span>
  )
}

export function MessagesFeed({ stores }: MessagesFeedProps) {
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const queryClient = useQueryClient()

  const storeMap = new Map(stores.map((s) => [s.id, s.name]))

  const queryParams = new URLSearchParams({ limit: '100' })
  if (storeFilter !== 'all') queryParams.set('store_id', storeFilter)

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['messages', storeFilter],
    queryFn: () => fetch(`/api/messages?${queryParams}`).then((r) => r.json()),
    refetchInterval: 2 * 60 * 1000,
  })

  const filtered = typeFilter === 'all' ? messages : messages.filter((m) => m.type === typeFilter)

  const toggleRead = useMutation({
    mutationFn: async ({ id, is_read }: { id: string; is_read: boolean }) => {
      await fetch(`/api/messages/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read }),
      })
    },
    onMutate: async ({ id, is_read }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', storeFilter] })
      const prev = queryClient.getQueryData<Message[]>(['messages', storeFilter])
      queryClient.setQueryData<Message[]>(['messages', storeFilter], (old) =>
        old?.map((m) => (m.id === id ? { ...m, is_read } : m)) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['messages', storeFilter], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const unreadCount = filtered.filter((m) => !m.is_read).length
  const orderCount = filtered.filter((m) => m.type === 'order').length
  const messageCount = filtered.filter((m) => m.type === 'message').length

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Activity Feed</h2>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-destructive text-destructive-foreground text-xs font-semibold px-2 py-0.5">
                {unreadCount} unread
              </span>
            )}
            {orderCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-0.5">
                <ShoppingBag className="size-3" />
                {orderCount} order{orderCount !== 1 ? 's' : ''}
              </span>
            )}
            {messageCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-semibold px-2 py-0.5">
                <MessageCircle className="size-3" />
                {messageCount} message{messageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v: string | null) => v && setTypeFilter(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={storeFilter} onValueChange={(v: string | null) => v && setStoreFilter(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.unread_message_count > 0 && ` (${s.unread_message_count})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border divide-y">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            No activity yet — the cron polls every 5 minutes
          </div>
        ) : (
          filtered.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-center gap-3 px-4 py-3 ${!msg.is_read ? 'bg-muted/30' : ''}`}
            >
              <span className={`size-2 rounded-full flex-shrink-0 ${!msg.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
              <TypeBadge type={msg.type} />
              <StoreBadge name={storeMap.get(msg.store_id) ?? 'Unknown'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{msg.sender_name}</p>
                <p className="text-xs text-muted-foreground truncate">{msg.subject}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
              </span>
              <Switch
                checked={msg.is_read}
                onCheckedChange={(checked) => toggleRead.mutate({ id: msg.id, is_read: checked })}
                aria-label={msg.is_read ? 'Mark as unread' : 'Mark as read'}
              />
            </div>
          ))
        )}
      </div>
    </section>
  )
}
