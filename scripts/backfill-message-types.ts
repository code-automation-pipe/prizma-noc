/**
 * One-shot cleanup for etsy_messages:
 *   1. Reclassify rows whose subject contains "refund" but were stored as
 *      type='order' (left over from before the refund classifier landed).
 *   2. Delete platform-billing rows ("Etsy charge refund", "Etsy Billing ...")
 *      that were ingested before the classifier learned to skip them.
 *
 * Idempotent — running twice is a no-op once the data is clean.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-message-types.ts
 */
import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { etsy_messages } from '../src/lib/db/schema'

async function main() {
  // 1. type='order' rows whose subject mentions "refund" → type='refund'
  const reclassified = await db
    .update(etsy_messages)
    .set({ type: 'refund' })
    .where(and(eq(etsy_messages.type, 'order'), sql`${etsy_messages.subject} ~* '\\mrefund'`))
    .returning({ id: etsy_messages.id, subject: etsy_messages.subject })

  console.log(`[backfill] reclassified ${reclassified.length} order(s) → refund`)
  for (const r of reclassified) console.log(`   • ${r.subject.slice(0, 80)}`)

  // 2. Delete platform-billing rows (Etsy's own charges/bills/invoices, not
  //    customer activity).
  const deleted = await db
    .delete(etsy_messages)
    .where(
      or(
        sql`${etsy_messages.subject} ~* '^\\s*etsy\\s+(charge|bill|invoice|fee)'`,
        ilike(etsy_messages.sender_name, '%etsy billing%'),
      ),
    )
    .returning({ id: etsy_messages.id, subject: etsy_messages.subject, sender: etsy_messages.sender_name })

  console.log(`[backfill] deleted ${deleted.length} platform-billing row(s)`)
  for (const d of deleted) console.log(`   • ${d.sender} — ${d.subject.slice(0, 80)}`)

  console.log('[backfill] done.')
}

main().catch((err) => { console.error(err); process.exit(1) })
