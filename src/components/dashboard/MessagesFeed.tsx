'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
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
  received_at: string
  is_read: boolean
}

interface MessagesFeedProps {
  stores: StoreWithStatus[]
}

export function MessagesFeed({ stores }: MessagesFeedProps) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(stores[0]?.id ?? '')
  const queryClient = useQueryClient()

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['messages', selectedStoreId],
    queryFn: () =>
      selectedStoreId
        ? fetch(`/api/messages?store_id=${selectedStoreId}&limit=50`).then((r) => r.json())
        : Promise.resolve([]),
    enabled: !!selectedStoreId,
  })

  const toggleRead = useMutation({
    mutationFn: async ({ id, is_read }: { id: string; is_read: boolean }) => {
      await fetch(`/api/messages/${id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read }),
      })
    },
    onMutate: async ({ id, is_read }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['messages', selectedStoreId] })
      const prev = queryClient.getQueryData<Message[]>(['messages', selectedStoreId])
      queryClient.setQueryData<Message[]>(['messages', selectedStoreId], (old) =>
        old?.map((m) => (m.id === id ? { ...m, is_read } : m)) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['messages', selectedStoreId], ctx.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedStoreId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const unreadCount = messages.filter((m) => !m.is_read).length

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Messages Feed</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-destructive text-destructive-foreground text-xs font-semibold px-2 py-0.5">
              {unreadCount} unread
            </span>
          )}
        </div>
        <Select value={selectedStoreId} onValueChange={(v: string | null) => v && setSelectedStoreId(v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a store" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.unread_message_count > 0 && ` (${s.unread_message_count})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border divide-y">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No messages detected for this store
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-center gap-4 px-4 py-3 ${!msg.is_read ? 'bg-muted/30' : ''}`}
            >
              {/* Unread dot */}
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${!msg.is_read ? 'bg-blue-500' : 'bg-transparent'}`}
              />
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
