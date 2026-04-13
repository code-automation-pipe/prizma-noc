// src/lib/modal/client.ts

export interface ModalBalance {
  /** USD credit balance */
  balance: number
  /** Raw response for debugging */
  raw: unknown
}

/**
 * Fetches the Modal workspace credit balance via the Modal REST API.
 *
 * Token format: "ak-xxxx" from Modal dashboard → Settings → API Tokens.
 * Endpoint to verify: if this returns 404, open Modal dashboard → Network tab
 * and look for a credits/balance request, then update the path below.
 */
export async function fetchModalBalance(): Promise<ModalBalance | null> {
  const tokenId = process.env.MODAL_TOKEN_ID
  const tokenSecret = process.env.MODAL_TOKEN_SECRET

  if (!tokenId || !tokenSecret) {
    console.warn('MODAL_TOKEN_ID / MODAL_TOKEN_SECRET not set — skipping Modal balance fetch')
    return null
  }

  const basicAuth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')

  const res = await fetch('https://api.modal.com/v1/workspaces/current', {
    headers: { Authorization: `Basic ${basicAuth}` },
  })

  if (!res.ok) {
    throw new Error(`Modal API error: ${res.status}`)
  }

  const text = await res.text()
  if (!text) {
    console.warn(`Modal API returned empty body for ${res.url} — endpoint may need updating`)
    return { balance: 0, raw: null }
  }
  const data = JSON.parse(text)
  console.log('[modal] raw response:', JSON.stringify(data))

  // Adapt to actual response shape — inspect the log above on first run and update this
  const balance = Number(
    data?.credits ?? data?.balance ?? data?.credit_balance ?? data?.data?.credits ?? 0
  )

  return { balance, raw: data }
}
