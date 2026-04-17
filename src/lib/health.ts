export type StoreHealth = 'healthy' | 'warning' | 'critical'

export function computeStoreHealth(
  emailScreenerConnected: boolean,
  draftCount: number,
  draftAlertThreshold: number,
): StoreHealth {
  if (!emailScreenerConnected) return 'critical'
  if (draftCount < draftAlertThreshold) return 'warning'
  return 'healthy'
}
