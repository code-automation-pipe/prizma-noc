export const runtime = 'nodejs'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { stores } from '@/lib/db/schema'

/**
 * GET /api/auth/connect?storeId=xxx
 * Redirects the browser to Microsoft's OAuth2 login page.
 * After login, Microsoft redirects to /api/auth/callback with a code.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')

  if (!storeId) {
    return new Response('Missing storeId', { status: 400 })
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
    columns: { id: true, outlook_email: true },
  })

  if (!store) {
    return new Response('Store not found', { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${appUrl}/api/auth/callback`,
    scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
    state: storeId,
    login_hint: store.outlook_email, // pre-fills the email field on Microsoft's login page
    response_mode: 'query',
  })

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  return Response.redirect(authUrl)
}
