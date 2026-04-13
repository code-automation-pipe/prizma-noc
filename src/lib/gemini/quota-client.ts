import { GoogleAuth } from 'google-auth-library'

export interface GeminiQuotaUsage {
  /** Remaining quota 0–100 (100 = fully available, 0 = exhausted) */
  remainingPercent: number
  /** Raw tokens used in the current window */
  tokensUsed: number
  /** Quota limit (tokens per minute) */
  tokensLimit: number
  /** Quota metric name found */
  quotaMetric: string
}

/**
 * Queries Google Cloud Monitoring for Gemini token quota usage.
 *
 * Requires env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON of a service account with roles/monitoring.viewer
 *   GOOGLE_CLOUD_PROJECT_ID      — GCP project ID that owns the Gemini API key
 */
export async function fetchGeminiQuotaUsage(): Promise<GeminiQuotaUsage | null> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID

  if (!saJson || !projectId) {
    console.warn('[gemini-quota] GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLOUD_PROJECT_ID not set — skipping quota fetch')
    return null
  }

  let credentials: object
  try {
    credentials = JSON.parse(saJson)
  } catch {
    console.error('[gemini-quota] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON')
    return null
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  })

  const client = await auth.getClient()
  const tokenData = await client.getAccessToken()
  const accessToken = tokenData.token
  if (!accessToken) {
    console.error('[gemini-quota] Failed to obtain access token')
    return null
  }

  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

  // Fetch usage time series for generativelanguage.googleapis.com
  const usageUrl = new URL(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`
  )
  usageUrl.searchParams.set(
    'filter',
    'metric.type="serviceruntime.googleapis.com/quota/rate/net_usage" AND resource.labels.service="generativelanguage.googleapis.com"'
  )
  usageUrl.searchParams.set('interval.startTime', fiveMinutesAgo.toISOString())
  usageUrl.searchParams.set('interval.endTime', now.toISOString())
  usageUrl.searchParams.set('aggregation.alignmentPeriod', '60s')
  usageUrl.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_RATE')

  const limitUrl = new URL(
    `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`
  )
  limitUrl.searchParams.set(
    'filter',
    'metric.type="serviceruntime.googleapis.com/quota/limit" AND resource.labels.service="generativelanguage.googleapis.com"'
  )
  limitUrl.searchParams.set('interval.startTime', fiveMinutesAgo.toISOString())
  limitUrl.searchParams.set('interval.endTime', now.toISOString())

  const headers = { Authorization: `Bearer ${accessToken}` }

  const [usageRes, limitRes] = await Promise.all([
    fetch(usageUrl.toString(), { headers }),
    fetch(limitUrl.toString(), { headers }),
  ])

  if (!usageRes.ok || !limitRes.ok) {
    const errText = !usageRes.ok ? await usageRes.text() : await limitRes.text()
    console.error('[gemini-quota] Monitoring API error:', errText.slice(0, 300))
    return null
  }

  const [usageData, limitData] = await Promise.all([usageRes.json(), limitRes.json()])

  // Log all available quota metrics so we can pick the right one
  const usageMetrics = (usageData.timeSeries ?? []).map(
    (ts: { metric: { labels: Record<string, string> } }) => ts.metric?.labels?.quota_metric
  )
  const limitMetrics = (limitData.timeSeries ?? []).map(
    (ts: { metric: { labels: Record<string, string> } }) => ts.metric?.labels?.quota_metric
  )
  console.log('[gemini-quota] available usage metrics:', usageMetrics)
  console.log('[gemini-quota] available limit metrics:', limitMetrics)

  // Prefer a token-based quota metric over request-based
  const preferTokens = (name: string) =>
    name?.includes('token') ? 0 : name?.includes('request') ? 1 : 2

  const usageSeries: Array<{
    metric: { labels: Record<string, string> }
    points: Array<{ interval: unknown; value: { doubleValue?: number; int64Value?: string } }>
  }> = (usageData.timeSeries ?? []).sort(
    (
      a: { metric: { labels: Record<string, string> } },
      b: { metric: { labels: Record<string, string> } }
    ) =>
      preferTokens(a.metric?.labels?.quota_metric) - preferTokens(b.metric?.labels?.quota_metric)
  )

  const limitSeries: Array<{
    metric: { labels: Record<string, string> }
    points: Array<{ interval: unknown; value: { doubleValue?: number; int64Value?: string } }>
  }> = (limitData.timeSeries ?? []).sort(
    (
      a: { metric: { labels: Record<string, string> } },
      b: { metric: { labels: Record<string, string> } }
    ) =>
      preferTokens(a.metric?.labels?.quota_metric) - preferTokens(b.metric?.labels?.quota_metric)
  )

  if (!usageSeries.length || !limitSeries.length) {
    console.warn('[gemini-quota] No time series data returned — project may have no quota data yet')
    return null
  }

  const topUsage = usageSeries[0]
  const topLimit = limitSeries[0]
  const quotaMetric = topUsage.metric?.labels?.quota_metric ?? 'unknown'

  const latestUsagePoint = topUsage.points?.[0]
  const latestLimitPoint = topLimit.points?.[0]

  const tokensUsed = Number(
    latestUsagePoint?.value?.doubleValue ?? latestUsagePoint?.value?.int64Value ?? 0
  )
  const tokensLimit = Number(
    latestLimitPoint?.value?.doubleValue ?? latestLimitPoint?.value?.int64Value ?? 1
  )

  const usedPercent = tokensLimit > 0 ? (tokensUsed / tokensLimit) * 100 : 0
  const remainingPercent = Math.max(0, Math.min(100, Math.round(100 - usedPercent)))

  console.log(
    `[gemini-quota] metric=${quotaMetric} used=${tokensUsed}/${tokensLimit} remaining=${remainingPercent}%`
  )

  return { remainingPercent, tokensUsed, tokensLimit, quotaMetric }
}
