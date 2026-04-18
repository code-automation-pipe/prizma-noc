export const runtime = 'nodejs'

/**
 * POST /api/admin/sync-passwords
 * Reads OUTLOOK_PASSWORDS env var (JSON: { storeName: appPassword })
 * and updates outlook_credentials for each matching store in the DB.
 *
 * Protected by CRON_SECRET. Run once after setting the env var.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { encryptCredentials } from '@/lib/crypto/credentials'

export async function POST(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const raw = process.env.OUTLOOK_PASSWORDS
  if (!raw) {
    return Response.json({ error: 'OUTLOOK_PASSWORDS env var is not set' }, { status: 400 })
  }

  let passwordMap: Record<string, string>
  try {
    passwordMap = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'OUTLOOK_PASSWORDS is not valid JSON' }, { status: 400 })
  }

  const allStores = await db.query.stores.findMany({
    columns: { id: true, name: true },
  })

  const results: { store: string; status: 'updated' | 'not_found' }[] = []

  for (const [storeName, appPassword] of Object.entries(passwordMap)) {
    const store = allStores.find(
      (s) => s.name.toLowerCase() === storeName.toLowerCase()
    )

    if (!store) {
      results.push({ store: storeName, status: 'not_found' })
      continue
    }

    const encrypted = encryptCredentials(
      JSON.stringify({ appPassword: appPassword.replace(/[\s-]/g, '') })
    )

    await db.update(stores).set({ outlook_credentials: encrypted }).where(eq(stores.id, store.id))

    results.push({ store: storeName, status: 'updated' })
  }

  return Response.json({ ok: true, results })
}
