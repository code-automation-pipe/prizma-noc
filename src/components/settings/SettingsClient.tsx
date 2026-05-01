'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Eye, EyeOff, ArrowLeft, FlaskConical, CheckCircle2, XCircle, Loader2, Link2, Send } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'

const INPUT =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50'

interface StoreRecord {
  id: string
  name: string
  shop_id: number
  outlook_email: string
  draft_alert_threshold: number
  last_draft_count: number
  last_draft_snapshot_at: string | null
  created_at: string
  connected: boolean
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground/70">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
    </div>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        className={INPUT + ' font-mono pr-10'}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="new-password"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

// ─── Add Store Dialog ────────────────────────────────────────────────────────

function AddStoreDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    shop_id: '',
    outlook_email: '',
    draft_alert_threshold: '10',
    appPassword: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          shop_id: Number(form.shop_id),
          outlook_email: form.outlook_email.trim(),
          draft_alert_threshold: Number(form.draft_alert_threshold),
          outlook_credentials: { appPassword: form.appPassword },
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(typeof err.error === 'string' ? err.error : 'Validation error')
      }
      toast.success(`"${form.name}" added`)
      setOpen(false)
      setForm({ name: '', shop_id: '', outlook_email: '', draft_alert_threshold: '10', appPassword: '' })
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-3.5" />
        Add Store
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Store</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
          <Field label="Store name" required>
            <input className={INPUT} value={form.name} onChange={set('name')} placeholder="My Etsy Shop" required />
          </Field>
          <Field label="Etsy Shop ID" required hint="Numeric ID — found in your Etsy seller dashboard URL">
            <input className={INPUT + ' font-mono'} type="number" value={form.shop_id} onChange={set('shop_id')} placeholder="123456789" required />
          </Field>
          <Field label="Outlook email" required>
            <input className={INPUT} type="email" value={form.outlook_email} onChange={set('outlook_email')} placeholder="shop@outlook.com" required />
          </Field>
          <Field
            label="App Password"
            required
            hint="Microsoft account → Security → Advanced security options → App passwords"
          >
            <PasswordInput
              value={form.appPassword}
              onChange={(v) => setForm((f) => ({ ...f, appPassword: v }))}
              placeholder="25-character app password"
              required
            />
          </Field>
          <Field label="Low-draft alert threshold">
            <input className={INPUT} type="number" min={1} value={form.draft_alert_threshold} onChange={set('draft_alert_threshold')} />
          </Field>
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add Store'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Store Dialog ───────────────────────────────────────────────────────

function EditStoreDialog({ store, onSuccess }: { store: StoreRecord; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: store.name,
    outlook_email: store.outlook_email,
    draft_alert_threshold: String(store.draft_alert_threshold),
    appPassword: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        outlook_email: form.outlook_email.trim(),
        draft_alert_threshold: Number(form.draft_alert_threshold),
      }
      if (form.appPassword) {
        body.outlook_credentials = { appPassword: form.appPassword }
      }
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update store')
      toast.success(`"${form.name}" updated`)
      setOpen(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-3.5" />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit — {store.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
          <Field label="Store name" required>
            <input className={INPUT} value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Outlook email" required>
            <input className={INPUT} type="email" value={form.outlook_email} onChange={set('outlook_email')} required />
          </Field>
          <Field label="App Password" hint="Leave blank to keep the current password">
            <PasswordInput
              value={form.appPassword}
              onChange={(v) => setForm((f) => ({ ...f, appPassword: v }))}
              placeholder="Leave blank to keep current"
            />
          </Field>
          <Field label="Low-draft alert threshold">
            <input className={INPUT} type="number" min={1} value={form.draft_alert_threshold} onChange={set('draft_alert_threshold')} />
          </Field>
          <DialogFooter className="mt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Store Dialog ─────────────────────────────────────────────────────

function DeleteStoreDialog({ store, onSuccess }: { store: StoreRecord; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/stores/${store.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete store')
      toast.success(`"${store.name}" deleted`)
      setOpen(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="icon-sm" />}>
        <Trash2 className="size-3.5" />
        <span className="sr-only">Delete {store.name}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Store</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{store.name}</span>? All messages and alert
          rules for this store will also be deleted.
        </p>
        <DialogFooter className="mt-2" showCloseButton>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete Store'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Test Email Connection Button ────────────────────────────────────────────

type TestResult =
  | { ok: true; email: string; total: number; recent: { sender: string; subject: string; date: string }[] }
  | { ok: false; error: string; raw?: string }

function TestEmailButton({ store }: { store: StoreRecord }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [result, setResult] = useState<TestResult | null>(null)

  async function run() {
    setState('loading')
    setResult(null)
    try {
      const res = await fetch(`/api/stores/${store.id}/test-email`, { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ ok: false, error: 'Network error' })
    } finally {
      setState('done')
    }
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) { setState('idle'); setResult(null) } }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FlaskConical className="size-3.5" />
        Test
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test Connection — {store.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Connects to{' '}
            <span className="font-mono text-foreground text-xs">{store.outlook_email}</span> via
            IMAP and reads the inbox to verify credentials.
          </p>

          {state === 'idle' && (
            <Button onClick={run} className="w-full">
              <FlaskConical className="size-3.5" />
              Run Test
            </Button>
          )}

          {state === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Connecting to IMAP…
            </div>
          )}

          {state === 'done' && result && (
            <div className="flex flex-col gap-3">
              {result.ok ? (
                <>
                  <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="size-4" />
                    Connected — {result.total} emails in inbox
                  </div>

                  {result.recent.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Last {result.recent.length} emails
                      </p>
                      {result.recent.map((m, i) => (
                        <div key={i} className="rounded-md border px-3 py-2 text-xs">
                          <div className="font-medium truncate">{m.subject}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {m.sender} · {new Date(m.date).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Inbox is empty — connection is working.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <XCircle className="size-4" />
                    Connection failed
                  </div>
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {result.error}
                  </div>
                  {result.raw && result.raw !== result.error && (
                    <p className="text-xs text-muted-foreground font-mono break-all">{result.raw}</p>
                  )}
                </>
              )}
              <Button variant="outline" size="sm" onClick={run} className="self-start">
                <FlaskConical className="size-3.5" />
                Run Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Test Telegram Button ────────────────────────────────────────────────────

function TestTelegramButton() {
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch('/api/test-telegram', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Test message sent — check your Telegram')
      } else {
        toast.error(data.error ?? 'Failed to send test message', {
          description: data.raw ? String(data.raw).slice(0, 200) : undefined,
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
      {loading ? 'Sending…' : 'Test Telegram'}
    </Button>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function SettingsClient() {
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const { data: stores = [], isLoading } = useQuery<StoreRecord[]>({
    queryKey: ['stores'],
    queryFn: () => fetch('/api/stores').then((r) => r.json()),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['stores'] })

  // Show toast on OAuth2 redirect back
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected) {
      toast.success('Microsoft account connected successfully')
      refresh()
      window.history.replaceState({}, '', '/settings')
    }
    if (error) {
      toast.error(`OAuth error: ${decodeURIComponent(error)}`)
      window.history.replaceState({}, '', '/settings')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-8 p-6 max-w-screen-md mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 pb-4 border-b">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>

      {/* Stores section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">Stores</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage Etsy shops and their Outlook App Passwords for email monitoring
            </p>
          </div>
          <AddStoreDialog onSuccess={refresh} />
        </div>

        {isLoading ? (
          <div className="rounded-lg border divide-y">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4 animate-pulse">
                <div className="size-2 rounded-full bg-muted" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="h-3.5 w-36 rounded bg-muted" />
                  <div className="h-3 w-52 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-lg border border-dashed flex flex-col items-center justify-center py-16 gap-2 text-center">
            <p className="text-sm font-medium">No stores yet</p>
            <p className="text-xs text-muted-foreground">Add your first store to start monitoring emails</p>
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {stores.map((store) => (
              <div
                key={store.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className={`size-2 rounded-full shrink-0 ${store.connected ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">{store.name}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      #{store.shop_id}
                    </span>
                    {store.connected ? (
                      <span className="text-xs font-medium text-green-600 shrink-0">connected</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-500 shrink-0">not connected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {store.outlook_email}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      threshold: {store.draft_alert_threshold}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a href={`/api/auth/connect?storeId=${store.id}`}>
                    <Button variant={store.connected ? 'outline' : 'default'} size="sm">
                      <Link2 className="size-3.5" />
                      {store.connected ? 'Reconnect' : 'Connect'}
                    </Button>
                  </a>
                  <TestEmailButton store={store} />
                  <EditStoreDialog store={store} onSuccess={refresh} />
                  <DeleteStoreDialog store={store} onSuccess={refresh} />
                </div>
              </div>
            ))}
          </div>
        )}

        {stores.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {stores.length} store{stores.length !== 1 ? 's' : ''} configured
          </p>
        )}
      </section>

      {/* Notifications section */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">Notifications</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verify the Telegram bot is wired up — sends a one-off ping to the configured chat.
          </p>
        </div>
        <div className="rounded-lg border px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Telegram bot</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uses <span className="font-mono">TELEGRAM_BOT_TOKEN</span> +{' '}
              <span className="font-mono">TELEGRAM_CHAT_ID</span> from env.
            </p>
          </div>
          <TestTelegramButton />
        </div>
      </section>
    </div>
  )
}
