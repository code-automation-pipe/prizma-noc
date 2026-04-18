export interface OAuthCredentials {
  refreshToken: string
  accessToken?: string
  expiresAt?: number
}

/**
 * Returns a valid access token for IMAP OAuth2.
 * Uses the cached access token if still valid, otherwise refreshes via the refresh token.
 * Returns updated credentials if a refresh was performed (caller should persist to DB).
 */
export async function resolveAccessToken(creds: OAuthCredentials): Promise<{
  accessToken: string
  updated?: OAuthCredentials
}> {
  // Reuse cached access token if it has at least 60s left
  if (creds.accessToken && creds.expiresAt && creds.expiresAt > Date.now() + 60_000) {
    return { accessToken: creds.accessToken }
  }

  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
    }),
  })

  const data = await res.json()
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error}`)
  }

  const updated: OAuthCredentials = {
    refreshToken: data.refresh_token ?? creds.refreshToken,
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return { accessToken: data.access_token, updated }
}
