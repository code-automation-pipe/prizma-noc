import { desc, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { etsy_messages, stores } from '../src/lib/db/schema'
import { decryptCredentials, encryptCredentials } from '../src/lib/crypto/credentials'
import { fetchNewEtsyMessages } from '../src/lib/imap/client'
import { resolveAccessToken, type OAuthCredentials } from '../src/lib/graph/oauth'
import { logMessageReceived } from '../src/lib/axiom/events'
import { notifyMessage, notifyOrder, notifyRefund, notifySuspension } from '../src/lib/telegram/client'

// Widen the default window so we catch yesterday's order even if the store
// already has prior messages. Accept `HOURS_BACK` env override (default 72h).
const hoursBack = Number(process.env.HOURS_BACK ?? 72)

async function main() {
  const allStores = await db.query.stores.findMany()
  console.log(`[poll] ${allStores.length} store(s); window = last ${hoursBack}h`)

  for (const store of allStores) {
    console.log(`\n── ${store.name} (${store.outlook_email}) ──`)
    try {
      const raw = JSON.parse(decryptCredentials(store.outlook_credentials)) as Record<string, string>

      let imapCreds: { appPassword?: string; accessToken?: string }
      if (raw.refreshToken) {
        const { accessToken, updated } = await resolveAccessToken(raw as unknown as OAuthCredentials)
        imapCreds = { accessToken }
        if (updated) {
          await db
            .update(stores)
            .set({ outlook_credentials: encryptCredentials(JSON.stringify(updated)) })
            .where(eq(stores.id, store.id))
          console.log('  [auth] refreshed OAuth token')
        }
      } else if (raw.appPassword) {
        imapCreds = { appPassword: raw.appPassword.replace(/[\s-]/g, '') }
      } else {
        console.log('  [skip] no usable credentials (need refreshToken or appPassword)')
        continue
      }

      const since = new Date(Date.now() - hoursBack * 3_600_000)
      console.log(`  [imap] scanning since ${since.toISOString()}`)
      const newMessages = await fetchNewEtsyMessages(store.outlook_email, imapCreds, since)
      console.log(`  [imap] ${newMessages.length} matched envelope(s)`)

      for (const msg of newMessages) {
        const inserted = await db
          .insert(etsy_messages)
          .values({
            store_id: store.id,
            message_id: msg.messageId,
            sender_name: msg.senderName,
            subject: msg.subject,
            type: msg.type,
            subtype: msg.subtype ?? null,
            price_usd: msg.priceUsd !== undefined ? String(msg.priceUsd) : null,
            country: msg.country ?? null,
            order_id: msg.orderId ?? null,
            received_at: msg.receivedAt,
          })
          .onConflictDoNothing({ target: etsy_messages.message_id })
          .returning({ id: etsy_messages.id })

        if (inserted.length === 0) {
          console.log(`    [dup] ${msg.type} — ${msg.subject.slice(0, 80)}`)
          continue
        }
        const tag =
          msg.type === 'order'
            ? `ORDER $${msg.priceUsd ?? '?'} ${msg.country ?? ''}`
            : msg.type === 'refund'
              ? `REFUND $${msg.priceUsd ?? '?'}`
              : msg.type === 'suspension'
                ? `SUSPENSION`
                : `MSG/${msg.subtype ?? '?'}`
        console.log(`    [new] ${tag} — ${msg.subject.slice(0, 80)}`)

        await logMessageReceived({
          store_id: store.id,
          store_name: store.name,
          sender_name: msg.senderName,
        })

        if (msg.type === 'order') {
          await notifyOrder({
            shopName: store.name,
            priceUsd: msg.priceUsd,
            country: msg.country,
            orderId: msg.orderId,
          })
        } else if (msg.type === 'refund') {
          await notifyRefund({
            shopName: store.name,
            priceUsd: msg.priceUsd,
            orderId: msg.orderId,
          })
        } else if (msg.type === 'suspension') {
          await notifySuspension({
            shopName: store.name,
            subject: msg.subject,
          })
        } else if (msg.subtype) {
          await notifyMessage({
            shopName: store.name,
            subtype: msg.subtype,
            senderName: msg.senderName,
            subject: msg.subject,
          })
        }
      }

      // A fresh count of this store's messages for visibility
      const latest = await db.query.etsy_messages.findFirst({
        where: eq(etsy_messages.store_id, store.id),
        orderBy: desc(etsy_messages.received_at),
      })
      if (latest) console.log(`  [db] latest row: ${latest.type} @ ${latest.received_at.toISOString()}`)
    } catch (err) {
      console.error(`  [error]`, err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[done]')
}

main().catch((err) => { console.error(err); process.exit(1) })
