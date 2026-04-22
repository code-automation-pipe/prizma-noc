import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

async function main() {
  const sql = neon(url!)

  const statements: Array<{ label: string; run: () => Promise<unknown> }> = [
    { label: 'subtype',   run: () => sql`ALTER TABLE etsy_messages ADD COLUMN IF NOT EXISTS subtype text` },
    { label: 'price_usd', run: () => sql`ALTER TABLE etsy_messages ADD COLUMN IF NOT EXISTS price_usd numeric` },
    { label: 'country',   run: () => sql`ALTER TABLE etsy_messages ADD COLUMN IF NOT EXISTS country text` },
    { label: 'order_id',  run: () => sql`ALTER TABLE etsy_messages ADD COLUMN IF NOT EXISTS order_id text` },
  ]

  for (const s of statements) {
    await s.run()
    console.log(`[ok] added/ensured column etsy_messages.${s.label}`)
  }

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'etsy_messages'
    ORDER BY ordinal_position
  ` as { column_name: string; data_type: string }[]
  console.log('\nFinal etsy_messages columns:')
  for (const c of cols) console.log(` - ${c.column_name} :: ${c.data_type}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
