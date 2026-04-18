'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectOnChange = (value: any) => void
import type { LedgerSummary } from '@/types'

interface ApiWalletProps {
  ledger: LedgerSummary
}

const SERVICES = [
  { key: 'oxylabs', label: 'OxyLabs', isLive: true, noBalance: true, displayMode: 'usd' as const },
  { key: 'gemini', label: 'Google AI Studio', isLive: true, noBalance: false, displayMode: 'gemini' as const },
  { key: 'tmapi', label: 'TMAPI / 1688', isLive: true, noBalance: false, displayMode: 'usd' as const },
  { key: 'modal', label: 'Modal (GPU)', isLive: false, noBalance: false, displayMode: 'usd' as const },
  { key: 'axiom', label: 'Axiom', isLive: true, noBalance: false, displayMode: 'usd' as const },
] as const

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (isNaN(then)) return '—'
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function StatusRow({
  label,
  count,
  last,
  dot,
  text,
}: {
  label: string
  count: number
  last: string | null
  dot: string
  text: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono ${text}`}>
        <span className={`size-1.5 rounded-full shrink-0 ${dot}`} />
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className={`font-mono font-bold tabular-nums text-sm ${text}`}>
          {count.toLocaleString()}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
          {relativeTime(last)}
        </span>
      </span>
    </div>
  )
}

export function ApiWallet({ ledger }: ApiWalletProps) {
  const [open, setOpen] = useState(false)
  const [service, setService] = useState<'gemini' | 'tmapi' | 'modal' | 'axiom'>('gemini')
  const [entryType, setEntryType] = useState<'topup' | 'free_credit' | 'spend'>('spend')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const queryClient = useQueryClient()

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/refresh-balances', { method: 'POST' })
      if (!res.ok) throw new Error('Refresh failed')
    },
    onSuccess: () => {
      toast.success('Balances refreshed')
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Failed to refresh balances'),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/api-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, entry_type: entryType, amount: Number(amount), note }),
      })
      if (!res.ok) throw new Error('Failed to add entry')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Ledger entry added')
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setOpen(false)
      setAmount('')
      setNote('')
    },
    onError: () => toast.error('Failed to add ledger entry'),
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">
          API Wallet
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshMutation.isPending ? 'Fetching…' : 'Fetch Balances'}
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              render={<button type="button" />}
            >
              <Plus className="h-3 w-3" />
              Add Entry
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-mono text-sm tracking-wide">Log Ledger Entry</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 mt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">Service</label>
                  <Select value={service} onValueChange={((v: string) => setService(v as typeof service)) as SelectOnChange}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google AI Studio</SelectItem>
                      <SelectItem value="tmapi">TMAPI / 1688</SelectItem>
                      <SelectItem value="modal">Modal (GPU)</SelectItem>
                      <SelectItem value="axiom">Axiom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">Type</label>
                  <Select
                    value={entryType}
                    onValueChange={((v: string) => setEntryType(v as typeof entryType)) as SelectOnChange}
                  >
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="topup">Top-up (paid)</SelectItem>
                      <SelectItem value="free_credit">Free Credit</SelectItem>
                      <SelectItem value="spend">Spend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-[0.15em] uppercase text-muted-foreground">Note (optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="e.g. Monthly topup"
                  />
                </div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={!amount || Number(amount) <= 0 || mutation.isPending}
                  className="font-mono text-sm"
                >
                  {mutation.isPending ? 'Saving…' : 'Save Entry'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {SERVICES.map((svc) => {
          const balance = svc.noBalance ? null : (ledger.balances[svc.key] ?? null)
          const totalCredits = ledger.credits?.[svc.key] ?? null
          const dailySpend = ledger.daily_spend[svc.key] ?? 0
          const cumSpend = ledger.cumulative_spend[svc.key] ?? 0
          const isGemini = svc.displayMode === 'gemini'
          // For Gemini: derive % remaining from credits vs cumulative spend (not the unreliable Cloud Quotas API).
          const creditsRemainingPct =
            isGemini && totalCredits && totalCredits > 0
              ? Math.max(0, Math.min(100, ((totalCredits - cumSpend) / totalCredits) * 100))
              : null
          const monthlyReqs = svc.noBalance ? (ledger.monthly_requests?.[svc.key] ?? null) : null
          const planLimit = svc.noBalance ? (ledger.plan_limits?.[svc.key] ?? null) : null
          const usedPct = planLimit && monthlyReqs !== null ? Math.round((monthlyReqs / planLimit) * 100) : null
          const isLow = !isGemini && balance !== null && balance < 10
          const axiomStatus = svc.key === 'axiom' ? ledger.axiom_status ?? null : null

          return (
            <div
              key={svc.key}
              className={`rounded-lg border bg-card p-4 flex flex-col gap-3 transition-colors ${
                isLow ? 'border-destructive/40' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-mono tracking-[0.1em] uppercase text-muted-foreground leading-tight">
                  {svc.label}
                </p>
                <span className={`inline-flex items-center gap-1 text-[9px] font-mono shrink-0 mt-0.5 ${
                  svc.isLive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/60'
                }`}>
                  <span className={`size-1.5 rounded-full ${
                    svc.isLive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  }`} />
                  {svc.isLive ? 'live' : 'manual'}
                </span>
              </div>

              {isGemini ? (
                <div className="flex flex-col gap-1">
                  {creditsRemainingPct === null ? (
                    <p className="text-2xl font-mono text-muted-foreground">—</p>
                  ) : (
                    <p className={`text-2xl font-mono font-bold tabular-nums ${
                      creditsRemainingPct < 20
                        ? 'text-destructive'
                        : creditsRemainingPct < 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground'
                    }`}>
                      {creditsRemainingPct.toFixed(1)}%
                    </p>
                  )}
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">credits remaining</p>
                    {totalCredits !== null ? (
                      <p className="text-[10px] font-mono text-muted-foreground">
                        ${cumSpend.toFixed(4)} / ${totalCredits.toFixed(2)}
                      </p>
                    ) : (
                      balance !== null && (
                        <p className="text-[10px] font-mono text-muted-foreground">bal: ${balance.toFixed(2)}</p>
                      )
                    )}
                    <p className="text-[10px] font-mono text-muted-foreground">
                      today: ${dailySpend.toFixed(4)}
                    </p>
                  </div>
                </div>
              ) : svc.noBalance ? (
                <div className="flex flex-col gap-1">
                  {monthlyReqs !== null ? (
                    <p className={`text-2xl font-mono font-bold tabular-nums ${
                      usedPct !== null && usedPct > 80
                        ? 'text-destructive'
                        : usedPct !== null && usedPct > 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-foreground'
                    }`}>
                      {monthlyReqs.toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-2xl font-mono text-muted-foreground">—</p>
                  )}
                  <div className="space-y-0.5">
                    {monthlyReqs !== null && planLimit !== null ? (
                      <>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {usedPct}% of {planLimit.toLocaleString()}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {(planLimit - monthlyReqs).toLocaleString()} remaining
                        </p>
                      </>
                    ) : monthlyReqs !== null ? (
                      <p className="text-[10px] text-muted-foreground">req / month</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">press fetch to load</p>
                    )}
                  </div>
                </div>
              ) : svc.key === 'axiom' ? (
                <div className="flex flex-col gap-1.5">
                  {axiomStatus ? (
                    <>
                      <StatusRow
                        label="Completed"
                        count={axiomStatus.completed.count}
                        last={axiomStatus.completed.last}
                        dot="bg-emerald-500"
                        text="text-emerald-600 dark:text-emerald-400"
                      />
                      <StatusRow
                        label="Error"
                        count={axiomStatus.error.count}
                        last={axiomStatus.error.last}
                        dot="bg-destructive"
                        text="text-destructive"
                      />
                      <StatusRow
                        label="Running"
                        count={axiomStatus.running.count}
                        last={axiomStatus.running.last}
                        dot="bg-amber-500"
                        text="text-amber-600 dark:text-amber-400"
                      />
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground font-mono">no axiom data</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className={`text-2xl font-mono font-bold tabular-nums ${
                    isLow ? 'text-destructive' : 'text-foreground'
                  }`}>
                    ${(balance ?? 0).toFixed(2)}
                  </p>
                  <div className="space-y-0.5">
                    {totalCredits !== null ? (
                      <p className="text-[10px] font-mono text-muted-foreground">
                        ${cumSpend.toFixed(2)} / ${totalCredits.toFixed(2)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">no credits logged</p>
                    )}
                    <p className="text-[10px] font-mono text-muted-foreground">
                      today: ${dailySpend.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
