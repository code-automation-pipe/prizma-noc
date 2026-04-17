import { asc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { encryptCredentials, decryptCredentials } from '@/lib/crypto/credentials'

export const runtime = 'nodejs'

const CreateStoreSchema = z.object({
  name: z.string().min(1).max(100),
  shop_id: z.number().int().positive(),
  outlook_email: z.string().email(),
  draft_alert_threshold: z.number().int().positive().default(10),
  outlook_credentials: z.object({
    appPassword: z.string().min(1),
  }),
})

export async function GET() {
  const rows = await db.query.stores.findMany({
    orderBy: asc(stores.name),
  })

  const result = rows.map(({ outlook_credentials, ...rest }) => {
    let connected = false
    try {
      const creds = JSON.parse(decryptCredentials(outlook_credentials))
      // Only OAuth2 refresh token counts as connected — app passwords are blocked by Microsoft
      connected = typeof creds?.refreshToken === 'string' && creds.refreshToken.length > 0
    } catch { /* malformed */ }
    return { ...rest, connected }
  })

  return Response.json(result)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = CreateStoreSchema.parse(body)
    const encrypted = encryptCredentials(JSON.stringify(parsed.outlook_credentials))

    const [store] = await db
      .insert(stores)
      .values({
        name: parsed.name,
        shop_id: parsed.shop_id,
        outlook_email: parsed.outlook_email,
        draft_alert_threshold: parsed.draft_alert_threshold,
        outlook_credentials: encrypted,
      })
      .returning({ id: stores.id, name: stores.name, shop_id: stores.shop_id })

    return Response.json(store, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues }, { status: 400 })
    }
    console.error('[POST /api/stores]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
