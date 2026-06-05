import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Public routes that don't require authentication
  const isAuthRoute = request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/login');

  // Check for the secure authentication cookie
  const authToken = request.cookies.get('scope-auth-token')?.value;

  if (!authToken && !isAuthRoute) {
    // Redirect unauthenticated users to the login page
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (authToken && isAuthRoute && request.nextUrl.pathname === '/login') {
    // If already logged in, don't let them sit on the login page
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Apply middleware to all routes except Next.js internals, static files, and the background analyze API
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/analyze).*)',
  ],
};
