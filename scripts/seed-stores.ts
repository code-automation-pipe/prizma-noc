/**
 * Seed script — inserts the 6 Etsy stores into the primary database.
 *
 * Usage:
 *   npm run db:seed
 *
 * Prerequisites:
 *   - .env.local must have DATABASE_URL and CREDENTIALS_ENCRYPTION_KEY set
 *   - Each store's Azure AD app must be registered; fill in tenantId / clientId /
 *     clientSecret below before running (currently set to "PLACEHOLDER").
 *
 * outlook_credentials stores Microsoft Graph OAuth2 client-credentials JSON
 * (NOT the Outlook email password). Register an Azure AD app per store (or one
 * shared app with access to all mailboxes) and update the values below.
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { encryptCredentials } from '../src/lib/crypto/credentials'
import { stores } from '../src/lib/db/schema'

interface StoreInput {
  name: string
  shop_id: number
  outlook_email: string
  tenantId: string
  clientId: string
  clientSecret: string
}

const STORE_DATA: StoreInput[] = [
  {
    name: 'GritGarden',
    shop_id: 23,
    outlook_email: 'liormenachemi11@outlook.com',
    tenantId: 'PLACEHOLDER',
    clientId: 'PLACEHOLDER',
    clientSecret: 'PLACEHOLDER',
  },
  {
    name: 'CrimsonTrove',
    shop_id: 28,
    outlook_email: 'maorgur1094@outlook.com',
    tenantId: 'PLACEHOLDER',
    clientId: 'PLACEHOLDER',
    clientSecret: 'PLACEHOLDER',
  },
  {
    name: 'LunarFan',
    shop_id: 29,
    outlook_email: 'ofirbazal11@outlook.com',
    tenantId: 'PLACEHOLDER',
    clientId: 'PLACEHOLDER',
    clientSecret: 'PLACEHOLDER',
  },
  {
    name: 'HanaPottery',
    shop_id: 30,
    outlook_email: 'liorofer309@outlook.com',
    tenantId: 'PLACEHOLDER',
    clientId: 'PLACEHOLDER',
    clientSecret: 'PLACEHOLDER',
  },
  {
    name: 'GlimmerLamp',
    shop_id: 31,
    outlook_email: 'mordahan11@outlook.com',
    tenantId: 'PLACEHOLDER',
    clientId: 'PLACEHOLDER',
    clientSecret: 'PLACEHOLDER',
  },
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')

  const db = drizzle(neon(databaseUrl))

  console.log(`Seeding ${STORE_DATA.length} stores…`)

  for (const store of STORE_DATA) {
    const credentials = encryptCredentials(
      JSON.stringify({
        tenantId: store.tenantId,
        clientId: store.clientId,
        clientSecret: store.clientSecret,
      })
    )

    await db
      .insert(stores)
      .values({
        name: store.name,
        shop_id: store.shop_id,
        outlook_email: store.outlook_email,
        outlook_credentials: credentials,
      })
      .onConflictDoNothing()

    console.log(`  ✓ ${store.name} (shop_id: ${store.shop_id})`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
