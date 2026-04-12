export type StoreHealth = 'healthy' | 'warning' | 'critical'

/**
 * Derives store health status from current metrics.
 * Used in both API responses and client-side rendering for consistency.
 */
export function computeStoreHealth(
  draftCount: number,
  threshold: number,
  unreadCount: number,
  publishedToday: number
): StoreHealth {
  if (draftCount < threshold || unreadCount > 10) return 'critical'
  if (draftCount < threshold + 5 || unreadCount > 5 || publishedToday === 0) return 'warning'
  return 'healthy'
}
