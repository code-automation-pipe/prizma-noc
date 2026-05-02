export const runtime = 'nodejs'
export const maxDuration = 60

import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { etsy_messages, stores } from '@/lib/db/schema'
import { decryptCredentials, encryptCredentials } from '@/lib/crypto/credentials'
import { fetchNewEtsyMessages } from '@/lib/imap/client'
import { resolveAccessToken, type OAuthCredentials } from '@/lib/graph/oauth'
import { logMessageReceived } from '@/lib/axiom/events'
import { notifyMessage, notifyOrder, notifyRefund, notifySuspension } from '@/lib/telegram/client'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const allStores = await db.query.stores.findMany()

  for (const store of allStores) {
    try {
      const raw = JSON.parse(decryptCredentials(store.outlook_credentials)) as Record<string, string>

      // Resolve IMAP auth — supports both OAuth2 (refreshToken) and app password
      let imapCreds: { appPassword?: string; accessToken?: string }

      if (raw.refreshToken) {
        // OAuth2 path: get (or refresh) access token
        const { accessToken, updated } = await resolveAccessToken(raw as unknown as OAuthCredentials)
        imapCreds = { accessToken }

        // Persist refreshed tokens if they changed
        if (updated) {
          await db
            .update(stores)
            .set({ outlook_credentials: encryptCredentials(JSON.stringify(updated)) })
            .where(eq(stores.id, store.id))
        }
      } else {
        // App password path (basic auth — may be blocked on some accounts)
        imapCreds = { appPassword: raw.appPassword.replace(/[\s-]/g, '') }
      }

      // Determine poll window: since last detected message, or last 24h
      const lastMsg = await db.query.etsy_messages.findFirst({
        where: eq(etsy_messages.store_id, store.id),
        orderBy: desc(etsy_messages.received_at),
      })
      const since = lastMsg
        ? new Date(lastMsg.received_at.getTime() - 60_000)
        : new Date(Date.now() - 86_400_000)

      const newMessages = await fetchNewEtsyMessages(store.outlook_email, imapCreds, since)

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

        // Only fire side-effects for actually-new rows — avoids duplicate pings on re-polls
        if (inserted.length === 0) continue

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

      if (newMessages.length > 0) {
        console.log(`[poll-email] Store "${store.name}": ${newMessages.length} new message(s)`)
      }
    } catch (err) {
      console.error(`[poll-email] Failed for store "${store.name}":`, err)
    }
  }

  return new Response('OK', { status: 200 })
}
