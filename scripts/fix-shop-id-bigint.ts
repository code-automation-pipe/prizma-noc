import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
sql`ALTER TABLE stores ALTER COLUMN shop_id TYPE BIGINT`
  .then(() => console.log('✓ shop_id column changed to BIGINT'))
  .catch(console.error)
