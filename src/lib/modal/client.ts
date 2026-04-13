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
  const token = process.env.MODAL_TOKEN
  if (!token) {
    console.warn('MODAL_TOKEN not set — skipping Modal balance fetch')
    return null
  }

  const res = await fetch('https://api.modal.com/v1/workspaces/current', {
    headers: { Authorization: `Token ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Modal API error: ${res.status}`)
  }

  const data = await res.json()

  // Adapt to actual response shape — inspect `raw` on first run and update this
  const balance = Number(
    data?.credits ?? data?.balance ?? data?.credit_balance ?? data?.data?.credits ?? 0
  )

  return { balance, raw: data }
}
