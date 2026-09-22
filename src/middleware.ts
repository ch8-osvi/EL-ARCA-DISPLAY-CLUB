import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas protegidas de la interfaz de usuario (admin pages)
const PROTECTED_UI_ROUTES = ['/admin'];
// Rutas donde NO se requiere autenticación (login)
const PUBLIC_UI_ROUTES = ['/admin/login', '/admin']; 
// (Nota: si /admin es la página de login, debe ser pública. Si el login está en /admin, 
// debemos asegurar que solo las subrutas como /admin/pos estén protegidas)

// Rutas de API que requieren autenticación estricta
const PROTECTED_API_ROUTES = ['/api/products', '/api/sales', '/api/ai/chat'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const adminSession = request.cookies.get('el_arca_admin_session');
  const isAuthenticated = adminSession && adminSession.value === 'authenticated';

  // --- 1. Proteger las páginas UI de Administración ---
  if (PROTECTED_UI_ROUTES.some((route) => pathname.startsWith(route))) {
    // Si la ruta es exactamente /admin, permitimos el acceso sin redirección.
    // El frontend (page.tsx) se encargará de mostrar el Login o el Catálogo según la sesión.
    // Solo exigiremos autenticación obligatoria para las subrutas (pos, ia, etc.)
    if (pathname !== '/admin' && pathname !== '/admin/') {
      if (!isAuthenticated) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    }
  }

  // --- 2. Proteger Operaciones Críticas de la API ---
  if (PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route))) {
    // Métodos que alteran la DB o exponen datos sensibles de negocio
    if (request.method !== 'OPTIONS') { // Permitir preflight CORS si es necesario
      if (!isAuthenticated) {
        return NextResponse.json(
          { success: false, error: 'Acceso denegado: API protegida' },
          { status: 401 }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - assets, public files
     */
    '/((?!_next/static|_next/image|favicon.ico|assets|favicon|logo).*)',
  ],
};
