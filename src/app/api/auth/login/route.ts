export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const expected = process.env.DASHBOARD_PASSWORD
  if (!expected || typeof body.password !== 'string' || body.password !== expected) {
    return Response.json({ error: 'Invalid password' }, { status: 401 })
  }

  const isProd = process.env.NODE_ENV === 'production'
  const maxAge = 60 * 60 * 24 * 30 // 30 days

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${expected}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`,
    },
  })
}
