'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Moon, RefreshCw, Settings, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { StoreWithStatus } from '@/types'

interface TopBarProps {
  stores: StoreWithStatus[]
  lastRefreshed: string
  onRefresh: () => void
}

export function TopBar({ stores, lastRefreshed, onRefresh }: TopBarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
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

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

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
        <Button variant="outline" size="icon-sm" aria-label="Settings" render={<Link href="/settings" />}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle dark mode"
        >
          {mounted && resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
          Sign out
        </Button>
      </div>
    </div>
  )
}
