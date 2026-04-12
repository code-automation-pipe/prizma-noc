import { ConfidentialClientApplication } from '@azure/msal-node'

export interface OutlookCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

interface CachedToken {
  token: string
  expiresAt: number
}

// In-memory token cache — keyed by clientId
// Tokens are re-used within a cron invocation; re-fetched on cold starts (fine, tokens last ~1h)
const tokenCache = new Map<string, CachedToken>()

/**
 * Acquires a Microsoft Graph access token using the client credentials flow.
 * Caches the token and reuses it until 60 seconds before expiry.
 */
export async function getGraphToken(credentials: OutlookCredentials): Promise<string> {
  const { tenantId, clientId, clientSecret } = credentials
  const cacheKey = clientId

  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })

  const result = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })

  if (!result?.accessToken || !result.expiresOn) {
    throw new Error(`Failed to acquire Graph token for clientId ${clientId}`)
  }

  tokenCache.set(cacheKey, {
    token: result.accessToken,
    expiresAt: result.expiresOn.getTime(),
  })

  return result.accessToken
}
