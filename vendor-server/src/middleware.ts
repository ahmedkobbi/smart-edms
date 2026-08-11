import { NextRequest, NextResponse } from 'next/server';

// Middleware protects all routes except /login, /api/auth, /api/heartbeat
// For API routes: returns 401 JSON (no redirect — fetch() can't handle redirects)
// For page routes: redirects to /login
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — no auth required
  if (pathname === '/login' || pathname.startsWith('/api/auth') || pathname.startsWith('/api/heartbeat')) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = req.cookies.get('vendor-session')?.value;
  if (!token) {
    // For API routes: return 401 JSON (fetch() can't handle redirects)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'unauthenticated', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    // For page routes: redirect to login
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Match all routes EXCEPT: _next, favicon, api/auth, api/heartbeat
export const config = {
  matcher: ['/((?!_next|favicon|api/auth|api/heartbeat).*)'],
};
