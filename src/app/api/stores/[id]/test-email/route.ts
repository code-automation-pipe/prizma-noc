export const runtime = 'nodejs'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { decryptCredentials } from '@/lib/crypto/credentials'
import { probeInbox } from '@/lib/imap/client'
import { resolveAccessToken, type OAuthCredentials } from '@/lib/graph/oauth'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const store = await db.query.stores.findFirst({ where: eq(stores.id, id) })
  if (!store) return Response.json({ error: 'Store not found' }, { status: 404 })

  let raw: Record<string, string>
  try {
    raw = JSON.parse(decryptCredentials(store.outlook_credentials))
    if (!raw?.appPassword && !raw?.refreshToken) throw new Error('No credentials configured — connect via OAuth2 or set an App Password')
  } catch (err) {
    return Response.json(
      { error: `Credentials error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    )
  }

  let imapCreds: { appPassword?: string; accessToken?: string }
  try {
    if (raw.refreshToken) {
      const { accessToken } = await resolveAccessToken(raw as unknown as OAuthCredentials)
      imapCreds = { accessToken }
    } else {
      imapCreds = { appPassword: raw.appPassword.replace(/[\s-]/g, '') }
    }
  } catch (err) {
    return Response.json(
      { ok: false, error: `Token error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  try {
    const probe = await probeInbox(store.outlook_email, imapCreds)
    return Response.json({ ok: true, email: store.outlook_email, ...probe })
  } catch (err) {
    // imapflow attaches the server's response text on the error object
    const msg = err instanceof Error ? err.message : String(err)
    const serverResponse = (err as Record<string, unknown>)?.response as string | undefined
    const fullDetail = serverResponse ? `${msg} — ${serverResponse}` : msg
    console.error(`[test-email] ${store.outlook_email}:`, fullDetail)

    let friendly: string
    const haystack = fullDetail.toUpperCase()
    if (haystack.includes('AUTHENTICATIONFAILED') || haystack.includes('INVALID CREDENTIALS') || haystack.includes('AUTHENTICATION UNSUCCESSFUL')) {
      friendly = 'Authentication failed — wrong App Password, or IMAP is not enabled on this Outlook account'
    } else if (haystack.includes('UNAVAILABLE') || haystack.includes('IMAP') || haystack.includes('DISABLED')) {
      friendly = 'IMAP is disabled — go to Outlook.com → Settings → Mail → Sync email → enable IMAP'
    } else if (haystack.includes('ECONNREFUSED') || haystack.includes('ETIMEDOUT') || haystack.includes('ENOTFOUND')) {
      friendly = 'Could not reach outlook.office365.com — check network connectivity'
    } else {
      friendly = fullDetail
    }

    return Response.json({ ok: false, error: friendly, raw: fullDetail }, { status: 502 })
  }
}
