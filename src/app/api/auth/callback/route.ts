export const runtime = 'nodejs'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { decryptCredentials, encryptCredentials } from '@/lib/crypto/credentials'

const NO_STORE: HeadersInit = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

function redirectTo(url: string): Response {
  // 303 ensures GET on the next hop and clears any pre-fetch context.
  return new Response(null, { status: 303, headers: { Location: url, ...NO_STORE } })
}

/**
 * GET /api/auth/callback?code=xxx&state=storeId
 * Microsoft redirects here after the user logs in.
 * Exchanges the authorization code for tokens and saves to DB.
 *
 * Idempotency: if the same code is submitted twice (browser prefetch,
 * link-preview, retried navigation), the first call wins. Subsequent
 * calls detect that the store has fresh credentials and short-circuit
 * to success rather than failing on the spent code.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const storeId = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`

  if (errorParam) {
    const desc = searchParams.get('error_description') ?? errorParam
    return redirectTo(`${appUrl}/settings?error=${encodeURIComponent(desc)}`)
  }
  if (!code || !storeId) {
    return redirectTo(`${appUrl}/settings?error=missing_code`)
  }

  // Exchange authorization code for tokens.
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${appUrl}/api/auth/callback`,
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error || !tokenRes.ok) {
    // If MS rejects the code as expired/invalid, check whether the store was
    // ALREADY connected within the last 2 minutes — that means a prior call
    // (browser prefetch, double-fetch) already redeemed this code successfully.
    if (tokens.error === 'invalid_grant') {
      const store = await db.query.stores.findFirst({
        where: eq(stores.id, storeId),
        columns: { outlook_credentials: true },
      })
      if (store?.outlook_credentials) {
        try {
          const creds = JSON.parse(decryptCredentials(store.outlook_credentials))
          if (creds.refreshToken && creds.expiresAt && creds.expiresAt - Date.now() > 30 * 60_000) {
            console.log('[oauth callback] code already redeemed by prior call — treating as success')
            return redirectTo(`${appUrl}/settings?connected=${storeId}`)
          }
        } catch { /* fall through to error redirect */ }
      }
    }
    const desc = tokens.error_description ?? tokens.error ?? `HTTP ${tokenRes.status}`
    console.error('[oauth callback] token exchange failed:', JSON.stringify(tokens))
    return redirectTo(`${appUrl}/settings?error=${encodeURIComponent(desc)}`)
  }

  const encrypted = encryptCredentials(
    JSON.stringify({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })
  )

  await db.update(stores).set({ outlook_credentials: encrypted }).where(eq(stores.id, storeId))

  return redirectTo(`${appUrl}/settings?connected=${storeId}`)
}
