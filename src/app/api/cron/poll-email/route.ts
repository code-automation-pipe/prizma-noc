export const runtime = 'nodejs'
export const maxDuration = 60

import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { etsy_messages, stores } from '@/lib/db/schema'
import { decryptCredentials } from '@/lib/crypto/credentials'
import { getGraphToken } from '@/lib/graph/auth'
import { fetchNewEtsyMessages } from '@/lib/graph/mail'
import { logMessageReceived } from '@/lib/axiom/events'

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const allStores = await db.query.stores.findMany()

  for (const store of allStores) {
    try {
      // 1. Decrypt Outlook credentials
      const creds = JSON.parse(decryptCredentials(store.outlook_credentials)) as {
        tenantId: string
        clientId: string
        clientSecret: string
      }

      // 2. Acquire Graph API token
      const token = await getGraphToken(creds)

      // 3. Determine poll window: since last detected message, or last 24h
      const lastMsg = await db.query.etsy_messages.findFirst({
        where: eq(etsy_messages.store_id, store.id),
        orderBy: desc(etsy_messages.received_at),
      })
      const since = lastMsg
        ? new Date(lastMsg.received_at.getTime() - 60_000) // 1 min overlap to avoid gaps
        : new Date(Date.now() - 86_400_000) // 24h ago on first run

      // 4. Fetch new Etsy message emails
      const newMessages = await fetchNewEtsyMessages(token, store.outlook_email, since)

      // 5. Upsert each message (message_id unique constraint prevents duplicates)
      for (const msg of newMessages) {
        await db
          .insert(etsy_messages)
          .values({
            store_id: store.id,
            message_id: msg.messageId,
            sender_name: msg.senderName,
            subject: msg.subject,
            received_at: msg.receivedAt,
          })
          .onConflictDoNothing({ target: etsy_messages.message_id })

        // 6. Log to Axiom for time-series charts
        await logMessageReceived({
          store_id: store.id,
          store_name: store.name,
          sender_name: msg.senderName,
        })
      }

      if (newMessages.length > 0) {
        console.log(`[poll-email] Store "${store.name}": ${newMessages.length} new message(s)`)
      }
    } catch (err) {
      // Log error but continue to next store
      console.error(`[poll-email] Failed for store "${store.name}":`, err)
    }
  }

  return new Response('OK', { status: 200 })
}
