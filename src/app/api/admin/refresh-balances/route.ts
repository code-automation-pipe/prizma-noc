export const runtime = 'nodejs'
export const maxDuration = 35

/**
 * Internal trigger for the fetch-api-balances cron.
 * Called by the dashboard "Refresh Balances" button.
 * CRON_SECRET never leaves the server.
 */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:3000`
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return new Response('CRON_SECRET not set', { status: 500 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  let res: Response
  try {
    res = await fetch(`${appUrl}/api/cron/fetch-api-balances`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    return new Response('Cron failed', { status: 502 })
  }

  return new Response('OK', { status: 200 })
}
