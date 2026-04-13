/**
 * Creates all etsy-monitor tables directly via raw SQL.
 * Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
 */

import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

async function main() {
  const sql = neon(process.env.DATABASE_URL!)

  console.log('Creating tables…')

  await sql`
    CREATE TABLE IF NOT EXISTS stores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      shop_id BIGINT NOT NULL UNIQUE,
      outlook_email TEXT NOT NULL,
      outlook_credentials TEXT NOT NULL,
      draft_alert_threshold INTEGER NOT NULL DEFAULT 10,
      last_draft_count INTEGER NOT NULL DEFAULT 0,
      last_draft_snapshot_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('  ✓ stores')

  await sql`
    CREATE TABLE IF NOT EXISTS etsy_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL UNIQUE,
      sender_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      received_at TIMESTAMP NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('  ✓ etsy_messages')

  await sql`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
      service TEXT,
      rule_type TEXT NOT NULL,
      threshold NUMERIC NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true
    )
  `
  console.log('  ✓ alert_rules')

  await sql`
    CREATE TABLE IF NOT EXISTS triggered_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      triggered_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('  ✓ triggered_alerts')

  await sql`
    CREATE TABLE IF NOT EXISTS api_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      service TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `
  console.log('  ✓ api_ledger')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
