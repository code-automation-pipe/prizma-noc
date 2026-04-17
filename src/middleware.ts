import { NextRequest, NextResponse } from 'next/server'

function isAuthenticated(req: NextRequest): boolean {
  const session = req.cookies.get('session')?.value
  const expected = process.env.DASHBOARD_PASSWORD
  return !!expected && session === expected
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Paths that bypass dashboard auth entirely
  const isPublic =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') ||    // login / logout
    pathname.startsWith('/api/cron/') ||    // cron routes enforce CRON_SECRET themselves
    pathname === '/api/health' ||
    pathname === '/login' ||
    pathname === '/favicon.ico'

  if (isPublic) return NextResponse.next()

  if (!isAuthenticated(request)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
