export const runtime = 'nodejs'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'
import { encryptCredentials } from '@/lib/crypto/credentials'

/**
 * GET /api/auth/callback?code=xxx&state=storeId
 * Microsoft redirects here after the user logs in.
 * Exchanges the authorization code for tokens and saves to DB.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const storeId = searchParams.get('state')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`

  if (error) {
    const desc = searchParams.get('error_description') ?? error
    return Response.redirect(`${appUrl}/settings?error=${encodeURIComponent(desc)}`)
  }

  if (!code || !storeId) {
    return Response.redirect(`${appUrl}/settings?error=missing_code`)
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${appUrl}/api/auth/callback`,
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
    }),
  })

  const tokens = await tokenRes.json()

  if (tokens.error) {
    const desc = tokens.error_description ?? tokens.error
    console.error('[oauth callback]', desc)
    return Response.redirect(`${appUrl}/settings?error=${encodeURIComponent(desc)}`)
  }

  const encrypted = encryptCredentials(
    JSON.stringify({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })
  )

  await db.update(stores).set({ outlook_credentials: encrypted }).where(eq(stores.id, storeId))

  return Response.redirect(`${appUrl}/settings?connected=${storeId}`)
}
