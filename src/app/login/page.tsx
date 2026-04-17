'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Invalid access token')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-[360px] px-8">
        <div className="mb-10">
          <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-muted-foreground mb-2">
            Ops Console
          </p>
          <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground">
            Etsy Monitor
          </h1>
          <div className="mt-4 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground"
            >
              Access Token
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••••••••"
              required
              autoComplete="current-password"
              className="w-full bg-transparent border-b border-input pb-2 text-sm font-mono focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/30 text-foreground"
            />
          </div>

          {error && (
            <p className="text-xs font-mono text-destructive">✗ {error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full text-sm font-mono font-medium py-2.5 px-4 border border-foreground/20 hover:border-foreground hover:bg-foreground hover:text-background transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 rounded-sm"
          >
            <span className="text-muted-foreground group-hover:text-inherit">
              {loading ? '···' : '→'}
            </span>
            <span>{loading ? 'Authenticating' : 'Sign in'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}
