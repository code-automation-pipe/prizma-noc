# Security + Vercel Deployment Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down unprotected API routes with session-based auth and document all env vars for clean Vercel deployment.

**Architecture:** `DASHBOARD_PASSWORD` env var is both the login credential and the httpOnly session cookie value — simple HMAC-free approach with no external auth dependencies. Next.js middleware (Edge runtime) enforces auth on every route except cron, health, auth, and login paths.

**Tech Stack:** Next.js 15 App Router · Next.js middleware (Edge) · Node.js (login/logout routes) · TypeScript · tsx (test runner)

---

## File Map

| Path | Action | Purpose |
|------|--------|---------|
| `.env.local.example` | Create | Documents all required env vars |
| `src/app/api/health/route.ts` | Create | Public health check endpoint |
| `scripts/security-test.ts` | Create | Automated security validation |
| `src/middleware.ts` | Create | Auth enforcement for all routes |
| `src/app/api/auth/login/route.ts` | Create | Sets httpOnly session cookie |
| `src/app/api/auth/logout/route.ts` | Create | Clears session cookie |
| `src/app/login/page.tsx` | Create | Login page (outside `(dashboard)` group) |
| `src/components/dashboard/TopBar.tsx` | Modify | Add sign-out button |

---

### Task 1: Document env vars

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Create `.env.local.example`**

```
# ── Primary Neon DB (this project) ────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# ── Workers Neon DB (read-only — workers-site-etsy) ───────────────────────
WORKERS_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# ── Encryption ────────────────────────────────────────────────────────────
# AES-256-GCM 32-byte hex key for encrypting Outlook OAuth2 credentials
# Generate: node -e "require('crypto').randomBytes(32).toString('hex')"
CREDENTIALS_ENCRYPTION_KEY=

# ── Axiom ─────────────────────────────────────────────────────────────────
AXIOM_TOKEN=
AXIOM_DATASET=etsy-monitor

# ── OxyLabs ───────────────────────────────────────────────────────────────
OXYLABS_USERNAME=
OXYLABS_PASSWORD=
OXYLABS_MONTHLY_LIMIT=50000

# ── Vercel Cron auth ──────────────────────────────────────────────────────
# Generate: openssl rand -hex 32
CRON_SECRET=

# ── Dashboard auth ────────────────────────────────────────────────────────
# Used as both login password and session cookie value.
# MUST be a long random token — not a human-memorable password.
# Generate: openssl rand -hex 32
DASHBOARD_PASSWORD=

# ── App URL ───────────────────────────────────────────────────────────────
# Required for server-to-self fetch in (dashboard)/page.tsx
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# ── Microsoft Graph (Outlook OAuth2) ──────────────────────────────────────
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: add .env.local.example with all required variables"
```

---

### Task 2: Health endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Create route**

```typescript
// src/app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

- [ ] **Step 2: Verify**

```bash
npm run dev
# In a second terminal:
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"2026-..."}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add /api/health endpoint for Vercel health checks"
```

---

### Task 3: Security test script (write FIRST — TDD)

**Files:**
- Create: `scripts/security-test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// scripts/security-test.ts
// Run: npx tsx scripts/security-test.ts
// Requires dev server running at NEXT_PUBLIC_APP_URL (default http://localhost:3000)
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
let passed = 0, failed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}: ${(e as Error).message}`)
    failed++
  }
}

async function run() {
  console.log(`Security tests → ${BASE}\n`)

  await test('GET /api/dashboard requires auth (→ 401)', async () => {
    const res = await fetch(`${BASE}/api/dashboard`)
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
  })

  await test('GET /api/stores requires auth (→ 401)', async () => {
    const res = await fetch(`${BASE}/api/stores`)
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
  })

  await test('POST /api/api-ledger requires auth (→ 401)', async () => {
    const res = await fetch(`${BASE}/api/api-ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'gemini', entry_type: 'spend', amount: 1 }),
    })
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
  })

  await test('POST /api/admin/refresh-balances requires auth (→ 401)', async () => {
    const res = await fetch(`${BASE}/api/admin/refresh-balances`, { method: 'POST' })
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
  })

  await test('POST /api/auth/login with wrong password → 401', async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'definitely-wrong-xyz-abc-123' }),
    })
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`)
  })

  await test('GET /api/health is public (→ 200, no auth needed)', async () => {
    const res = await fetch(`${BASE}/api/health`)
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
  })

  await test('GET /api/cron/* exempt from dashboard middleware (→ not a redirect)', async () => {
    const res = await fetch(`${BASE}/api/cron/snapshot-drafts`, { redirect: 'manual' })
    if (res.status === 302 || res.status === 307 || res.status === 308) {
      throw new Error('Middleware is redirecting cron routes — they must be exempt')
    }
  })

  await test('POST /api/auth/login with correct password → 200 + Set-Cookie', async () => {
    const pw = process.env.DASHBOARD_PASSWORD
    if (!pw) { console.log('    (skipped — DASHBOARD_PASSWORD not in env)'); return }
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
    const cookie = res.headers.get('set-cookie')
    if (!cookie?.includes('session=')) throw new Error('No session cookie in response')
    if (!cookie.includes('HttpOnly')) throw new Error('Cookie is not HttpOnly')
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run to confirm tests currently fail (expected — auth not implemented yet)**

```bash
# Dev server must be running:
npx tsx scripts/security-test.ts
# Expected: dashboard/stores/api-ledger/admin tests FAIL (return 200 instead of 401)
# This confirms the auth gap we're fixing
```

- [ ] **Step 3: Commit test script**

```bash
git add scripts/security-test.ts
git commit -m "test: security test script for unprotected API routes"
```

---

### Task 4: Auth middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware**

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server'

function isAuthenticated(req: NextRequest): boolean {
  const session = req.cookies.get('session')?.value
  const expected = process.env.DASHBOARD_PASSWORD
  return !!expected && session === expected
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Paths that bypass dashboard auth entirely
  const isPublic =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') ||    // login / logout
    pathname.startsWith('/api/cron/') ||    // cron routes enforce CRON_SECRET themselves
    pathname === '/api/health' ||
    pathname === '/login' ||
    pathname === '/favicon.ico'

  if (isPublic) return NextResponse.next()

  if (!isAuthenticated(request)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
```

- [ ] **Step 2: Generate `DASHBOARD_PASSWORD` and add to `.env.local`**

```bash
node -e "require('crypto').randomBytes(32).toString('hex')"
# Copy the output, then in .env.local:
# DASHBOARD_PASSWORD=<paste-output-here>
```

- [ ] **Step 3: Restart dev server and run security tests**

```bash
# Stop and restart dev server so new env vars load:
npm run dev
# In another terminal:
npx tsx scripts/security-test.ts
# Expected: ALL 8 tests PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: Next.js middleware — session cookie auth for all routes"
```

---

### Task 5: Login and logout API routes

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Create login route**

```typescript
// src/app/api/auth/login/route.ts
export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const expected = process.env.DASHBOARD_PASSWORD
  if (!expected || typeof body.password !== 'string' || body.password !== expected) {
    return Response.json({ error: 'Invalid password' }, { status: 401 })
  }

  const isProd = process.env.NODE_ENV === 'production'
  const maxAge = 60 * 60 * 24 * 30 // 30 days

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${expected}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`,
    },
  })
}
```

- [ ] **Step 2: Create logout route**

```typescript
// src/app/api/auth/logout/route.ts
export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0',
    },
  })
}
```

- [ ] **Step 3: Test manually**

```bash
# Wrong password → 401:
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}'
# Expected: 401

# Correct password → 200 + Set-Cookie (replace TOKEN with your DASHBOARD_PASSWORD):
curl -si -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"TOKEN"}' | grep -E "HTTP|set-cookie"
# Expected: HTTP/1.1 200  and  set-cookie: session=TOKEN; HttpOnly...
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts
git commit -m "feat: login/logout routes with httpOnly session cookie"
```

---

### Task 6: Login page

**Files:**
- Create: `src/app/login/page.tsx`

Note: placed at `src/app/login/` (NOT inside `(dashboard)/`) so it is NOT subject to dashboard layout or auth wrapping.

- [ ] **Step 1: Create login page**

```typescript
// src/app/login/page.tsx
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
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Etsy Monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your access token to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Access Token
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••••••"
              required
              autoComplete="current-password"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test the full login flow in browser**

```bash
# With dev server running, navigate to http://localhost:3000
# Expected sequence:
#   1. Middleware redirects to /login (no session cookie)
#   2. Enter wrong token → "Invalid access token" error appears
#   3. Enter correct DASHBOARD_PASSWORD → redirected to /
#   4. Dashboard loads normally
```

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat: login page — token-based session auth"
```

---

### Task 7: Sign-out button in TopBar

**Files:**
- Modify: `src/components/dashboard/TopBar.tsx`

- [ ] **Step 1: Add logout handler and button**

In `src/components/dashboard/TopBar.tsx`, add `handleLogout` inside the `TopBar` function (after the `timeAgo` block), and add the sign-out `Button` as the last item in the right-side flex group.

Replace the entire `export function TopBar(...)` with:

```typescript
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
    try { return formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true }) }
    catch { return 'just now' }
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
```

- [ ] **Step 2: Verify sign-out in browser**

Click "Sign out" button → should redirect to `/login`. Re-enter token → back to dashboard.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/TopBar.tsx
git commit -m "feat: add sign out button to TopBar"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full security test suite**

```bash
npx tsx scripts/security-test.ts
# Expected output:
#   ✓ GET /api/dashboard requires auth (→ 401)
#   ✓ GET /api/stores requires auth (→ 401)
#   ✓ POST /api/api-ledger requires auth (→ 401)
#   ✓ POST /api/admin/refresh-balances requires auth (→ 401)
#   ✓ POST /api/auth/login with wrong password → 401
#   ✓ GET /api/health is public (→ 200, no auth needed)
#   ✓ GET /api/cron/* exempt from dashboard middleware (→ not a redirect)
#   ✓ POST /api/auth/login with correct password → 200 + Set-Cookie
#   8 passed, 0 failed
```

- [ ] **Step 2: Verify production build succeeds**

```bash
npm run build
# Expected: exits 0, no TypeScript errors
```

- [ ] **Step 3: Vercel env var checklist**

In the Vercel dashboard, confirm these env vars are set for Production:
- `DATABASE_URL`
- `WORKERS_DATABASE_URL`
- `CREDENTIALS_ENCRYPTION_KEY`
- `AXIOM_TOKEN` + `AXIOM_DATASET`
- `OXYLABS_USERNAME` + `OXYLABS_PASSWORD` + `OXYLABS_MONTHLY_LIMIT`
- `CRON_SECRET`
- `DASHBOARD_PASSWORD`
- `NEXT_PUBLIC_APP_URL`
- `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` + `MICROSOFT_TENANT_ID`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: security hardening complete — auth middleware + login flow"
```
