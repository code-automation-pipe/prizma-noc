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
