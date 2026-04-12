import { ingestEvents } from './client'

export async function logDraftSnapshot(
  snapshots: Array<{ shop_id: number; store_name: string; draft_count: number }>
): Promise<void> {
  const now = new Date().toISOString()
  await ingestEvents(
    snapshots.map((s) => ({
      _time: now,
      type: 'draft_snapshot',
      shop_id: s.shop_id,
      store_name: s.store_name,
      draft_count: s.draft_count,
    }))
  )
}

export async function logApiSpend(entry: {
  service: string
  amount: number
  balance_after?: number
}): Promise<void> {
  await ingestEvents([{ _time: new Date().toISOString(), type: 'api_spend', ...entry }])
}

export async function logProductsPublished(data: {
  shop_id: number
  store_name: string
  count: number
}): Promise<void> {
  await ingestEvents([{ _time: new Date().toISOString(), type: 'products_published', ...data }])
}

export async function logMessageReceived(data: {
  store_id: string
  store_name: string
  sender_name: string
}): Promise<void> {
  await ingestEvents([{ _time: new Date().toISOString(), type: 'message_received', ...data }])
}

export async function logOxylabsUsage(data: {
  requests_consumed: number
  traffic_consumed_gb: number
  date: string
}): Promise<void> {
  await ingestEvents([{ _time: new Date().toISOString(), type: 'oxylabs_usage', ...data }])
}
