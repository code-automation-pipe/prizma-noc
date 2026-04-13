export interface GeminiProbeResult {
  /** true = API key valid and reachable */
  alive: boolean
  /** Tokens used by this probe (from usageMetadata) */
  probeTokenCount: number
}

/**
 * Probes Gemini API health with a 1-token generateContent call.
 * Google's API does NOT return rate-limit headers — we can only detect alive/down.
 * Model: gemini-2.5-flash (cheapest available; uses ~1 token per probe).
 */
export async function probeGeminiQuota(): Promise<GeminiProbeResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — skipping Gemini probe')
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: '.' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
        signal: controller.signal,
      }
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[gemini] probe failed: ${res.status} — ${errBody.slice(0, 200)}`)
    return { alive: false, probeTokenCount: 0 }
  }

  const data = await res.json()
  const tokenCount = Number(data?.usageMetadata?.totalTokenCount ?? 1)
  console.log(`[gemini] probe OK — ${tokenCount} tokens`)

  return { alive: true, probeTokenCount: tokenCount }
}
