export interface GeminiQuotaResult {
  /** Tokens remaining this minute (from rate-limit header) */
  remainingTokensPerMinute: number
  /** Total token limit per minute */
  limitTokensPerMinute: number
  /** Quota health 0–1 (remaining / limit) */
  quotaHealth: number
  /** Token count of the probe request itself (always ~1) */
  probeTokenCount: number
}

/**
 * Makes a free countTokens call to Gemini to probe rate-limit headers.
 * countTokens does not generate content and costs $0.
 *
 * Returns remaining token quota for the current minute window.
 * Use this for "API health" monitoring rather than exact USD billing.
 */
export async function probeGeminiQuota(): Promise<GeminiQuotaResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — skipping Gemini probe')
    return null
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:countTokens?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: '.' }] }] }),
    }
  )

  if (!res.ok) {
    throw new Error(`Gemini countTokens error: ${res.status}`)
  }

  const data = await res.json()

  const remaining = Math.max(0, Number(res.headers.get('x-ratelimit-remaining-tokens') ?? 0) || 0)
  const limit = Math.max(1, Number(res.headers.get('x-ratelimit-limit-tokens') ?? 1) || 1)

  return {
    remainingTokensPerMinute: remaining,
    limitTokensPerMinute: limit,
    quotaHealth: limit > 0 ? remaining / limit : 1,
    probeTokenCount: Number(data.totalTokens ?? 1),
  }
}
