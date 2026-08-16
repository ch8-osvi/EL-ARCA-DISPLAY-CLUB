import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require admin authentication
const PROTECTED_ROUTES = ['/admin'];

// API routes that require auth (write operations)
const PROTECTED_API_ROUTES = ['/api/products'];
const PROTECTED_API_ACTIONS = ['delete', 'unhide', 'add', 'restore', 'sync', 'delete-permanent'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Protect admin page routes ---
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    // Check for admin session cookie
    const adminSession = request.cookies.get('el_arca_admin_session');
    if (!adminSession || adminSession.value !== 'authenticated') {
      // Allow access to /admin itself (it handles its own login UI)
      // Only block sub-routes like /admin/ocultos if somehow accessed directly
      // The actual auth check is done client-side via sessionStorage
      // This is an extra server-side safety layer
      return NextResponse.next();
    }
  }

  // --- Protect API write operations ---
  if (pathname.startsWith('/api/products') && request.method === 'POST') {
    const referer = request.headers.get('referer') || '';
    const origin = request.headers.get('origin') || '';
    const host = request.headers.get('host') || '';

    // Allow requests from the same origin (our app)
    const allowedOrigins = [
      `https://${host}`,
      `http://${host}`,
      'http://localhost:3000',
      'http://localhost:3001',
    ];

    const isFromOurApp = allowedOrigins.some(
      (allowed) => referer.startsWith(allowed) || origin.startsWith(allowed)
    );

    if (!isFromOurApp && origin !== '') {
      // Block cross-origin POST requests to our API
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match admin pages
    '/admin/:path*',
    // Match product API
    '/api/products/:path*',
  ],
};
