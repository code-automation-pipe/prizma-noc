import { GoogleAuth } from 'google-auth-library'

export interface GeminiQuotaUsage {
  remainingPercent: number
  tokensUsed: number
  tokensLimit: number
  quotaMetric: string
}

// NOTE: Cloud Monitoring quota/allocation/usage metrics are NOT populated for
// Google AI Studio API keys — only Vertex AI exposes generation quota data.
// Quota % display is therefore only available when using a Vertex AI service account.

type TimeSeries = {
  metric: { labels: Record<string, string> }
  resource: { labels: Record<string, string> }
  points: Array<{ value: { doubleValue?: number; int64Value?: string } }>
}

type MonitoringResponse = { timeSeries?: TimeSeries[] }

async function getGcpAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
  const saB64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if ((!saB64 && !saJson) || !projectId) return null

  let credentials: object
  try {
    const raw = saB64 ? Buffer.from(saB64, 'base64').toString('utf-8') : saJson!
    credentials = JSON.parse(raw)
  } catch {
    console.error('[gemini-quota] Failed to parse service account credentials')
    return null
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  })
  const client = await auth.getClient()
  const tokenData = await client.getAccessToken()
  if (!tokenData.token) return null

  return { token: tokenData.token, projectId }
}

export async function fetchGeminiQuotaUsage(): Promise<GeminiQuotaUsage | null> {
  const gcp = await getGcpAccessToken()
  if (!gcp) {
    console.warn('[gemini-quota] GOOGLE_SERVICE_ACCOUNT_B64 + GOOGLE_CLOUD_PROJECT_ID required — skipping')
    return null
  }

  const { token, projectId } = gcp
  const headers = { Authorization: `Bearer ${token}` }
  const now = new Date()

  const fetchSeries = async (metricType: string, start: Date): Promise<TimeSeries[]> => {
    const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`)
    url.searchParams.set('filter', `metric.type="${metricType}"`)
    url.searchParams.set('interval.startTime', start.toISOString())
    url.searchParams.set('interval.endTime', now.toISOString())
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      console.error(`[gemini-quota] ${metricType} failed: ${res.status}`)
      return []
    }
    const data: MonitoringResponse = await res.json()
    return data.timeSeries ?? []
  }

  const GEMINI_SERVICES = ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com']

  // Try 24h first, fall back to 7d if no Gemini service found
  let allUsage: TimeSeries[] = []
  let limitSeries: TimeSeries[] = []
  let windowLabel = '24h'

  for (const [label, start] of [['24h', new Date(now.getTime() - 24 * 60 * 60 * 1000)], ['7d', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)]] as [string, Date][]) {
    const [rate, alloc, limits] = await Promise.all([
      fetchSeries('serviceruntime.googleapis.com/quota/rate/net_usage', start),
      fetchSeries('serviceruntime.googleapis.com/quota/allocation/usage', start),
      fetchSeries('serviceruntime.googleapis.com/quota/limit', start),
    ])
    const usage = [...rate, ...alloc]
    const hasGemini = GEMINI_SERVICES.some(svc => usage.some(ts => ts.resource?.labels?.service === svc))
    if (hasGemini) {
      allUsage = usage
      limitSeries = limits
      windowLabel = label
      break
    }
    // on first pass with no Gemini, continue to 7d
  }

  const usageServices = [...new Set(allUsage.map(ts => ts.resource?.labels?.service))]
  console.log(`[gemini-quota] usage services (${windowLabel}):`, usageServices)

  const matchedService = GEMINI_SERVICES.find(svc =>
    allUsage.some(ts => ts.resource?.labels?.service === svc)
  )
  console.log('[gemini-quota] matched service:', matchedService ?? 'none')

  if (!matchedService) {
    console.warn('[gemini-quota] No Gemini quota data found in 24h or 7d windows')
    return null
  }

  const geminiUsage = allUsage.filter(ts => ts.resource?.labels?.service === matchedService)
  const geminiLimit = limitSeries.filter(ts => ts.resource?.labels?.service === matchedService)

  const preferTokens = (name: string) => {
    if (name?.includes('token')) return 0
    if (name?.includes('generate') || name?.includes('predict')) return 1
    if (name?.includes('request') && !name?.includes('resource_management')) return 2
    return 99 // deprioritize resource_management and other non-generation metrics
  }

  const topUsage = [...geminiUsage].sort(
    (a, b) => preferTokens(a.metric?.labels?.quota_metric) - preferTokens(b.metric?.labels?.quota_metric)
  )[0]

  const topLimit = [...geminiLimit].sort(
    (a, b) => preferTokens(a.metric?.labels?.quota_metric) - preferTokens(b.metric?.labels?.quota_metric)
  )[0]

  const usageMetrics = geminiUsage.map(ts => ts.metric?.labels?.quota_metric)
  const limitMetrics = geminiLimit.map(ts => ts.metric?.labels?.quota_metric)
  console.log('[gemini-quota] usage metrics:', usageMetrics)
  console.log('[gemini-quota] limit metrics:', limitMetrics)

  if (!topUsage || !topLimit) {
    console.warn(`[gemini-quota] Missing usage or limit series for ${matchedService}`)
    return null
  }

  // Skip if best metric is just resource management (not actual generation quota)
  if (topUsage.metric?.labels?.quota_metric?.includes('resource_management')) {
    console.warn('[gemini-quota] Only resource_management metric found — not a generation quota, skipping')
    return null
  }

  const quotaMetric = topUsage.metric?.labels?.quota_metric ?? 'unknown'
  const tokensUsed = Number(topUsage.points?.[0]?.value?.doubleValue ?? topUsage.points?.[0]?.value?.int64Value ?? 0)
  const tokensLimit = Number(topLimit.points?.[0]?.value?.doubleValue ?? topLimit.points?.[0]?.value?.int64Value ?? 1)

  const usedPercent = tokensLimit > 0 ? (tokensUsed / tokensLimit) * 100 : 0
  const remainingPercent = Math.max(0, Math.min(100, Math.round(100 - usedPercent)))

  console.log(`[gemini-quota] metric=${quotaMetric} used=${tokensUsed}/${tokensLimit} remaining=${remainingPercent}%`)

  return { remainingPercent, tokensUsed, tokensLimit, quotaMetric }
}
