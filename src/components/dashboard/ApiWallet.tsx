'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  { key: 'oxylabs', label: 'OxyLabs', isLive: true },
  { key: 'gemini', label: 'Google AI Studio', isLive: false },
  { key: 'tmapi', label: 'TMAPI / 1688', isLive: false },
  { key: 'modal', label: 'Modal (GPU)', isLive: false },
] as const

export function ApiWallet({ ledger }: ApiWalletProps) {
  const [open, setOpen] = useState(false)
  const [service, setService] = useState<'gemini' | 'tmapi' | 'modal'>('gemini')
  const [entryType, setEntryType] = useState<'topup' | 'spend'>('spend')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const queryClient = useQueryClient()

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
        <h2 className="text-lg font-semibold">API Wallet</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            render={<button type="button" />}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Entry
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Ledger Entry</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Service</label>
                <Select value={service} onValueChange={((v: string) => setService(v as typeof service)) as SelectOnChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Google AI Studio</SelectItem>
                    <SelectItem value="tmapi">TMAPI / 1688</SelectItem>
                    <SelectItem value="modal">Modal (GPU)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={entryType}
                  onValueChange={((v: string) => setEntryType(v as typeof entryType)) as SelectOnChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="topup">Top-up</SelectItem>
                    <SelectItem value="spend">Spend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  placeholder="e.g. Monthly topup"
                />
              </div>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!amount || Number(amount) <= 0 || mutation.isPending}
              >
                {mutation.isPending ? 'Saving…' : 'Save Entry'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {SERVICES.map((svc) => {
          const balance = svc.isLive ? null : (ledger.balances[svc.key] ?? 0)
          const dailySpend = ledger.daily_spend[svc.key] ?? 0
          const cumSpend = ledger.cumulative_spend[svc.key] ?? 0
          const isLow = balance !== null && balance < 10

          return (
            <Card key={svc.key} className={isLow ? 'border-destructive' : ''}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{svc.label}</CardTitle>
                  <Badge variant={svc.isLive ? 'default' : 'secondary'} className="text-xs">
                    {svc.isLive ? 'Live' : 'Manual'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex flex-col gap-1">
                {balance !== null ? (
                  <p className={`text-2xl font-bold ${isLow ? 'text-destructive' : ''}`}>
                    ${balance.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No balance endpoint</p>
                )}
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Today: ${dailySpend.toFixed(2)}</p>
                  <p>Cumulative: ${cumSpend.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
