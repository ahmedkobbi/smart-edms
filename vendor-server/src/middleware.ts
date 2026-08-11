import { NextRequest, NextResponse } from 'next/server';

// Middleware protects all routes except /login and /api/auth
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes
  if (pathname === '/login' || pathname.startsWith('/api/auth') || pathname.startsWith('/api/heartbeat')) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = req.cookies.get('vendor-session')?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon|api/auth|api/heartbeat).*)'],
};
