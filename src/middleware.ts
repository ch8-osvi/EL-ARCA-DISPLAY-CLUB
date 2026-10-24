import { NextResponse, type NextRequest } from "next/server";
import {
  validSession,
  sameOrigin,
  SESSION_COOKIE,
} from "@/lib/security/session";
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicGet =
    request.method === "GET" &&
    [
      "/api/products",
      "/api/exchange-rate",
      "/api/eltoque",
      "/api/whatsapp/contact",
    ].includes(path) &&
    !request.nextUrl.searchParams.has("all");
  const protectedApi =
    path.startsWith("/api/") &&
    !publicGet &&
    !path.startsWith("/api/auth/") &&
    ![
      "/api/whatsapp/webhook",
      "/api/whatsapp/bridge",
      "/api/analytics",
    ].includes(path);
  const protectedUi = path.startsWith("/admin/") && path !== "/admin/";
  if (protectedApi || protectedUi) {
    if (!(await validSession(request.cookies.get(SESSION_COOKIE)?.value)))
      return protectedApi
        ? NextResponse.json(
            { success: false, error: "Acceso denegado: API protegida" },
            { status: 401 },
          )
        : NextResponse.redirect(new URL("/admin", request.url));
    if (
      protectedApi &&
      !["GET", "HEAD"].includes(request.method) &&
      !sameOrigin(request)
    )
      return NextResponse.json(
        { error: "Origen no permitido" },
        { status: 403 },
      );
  }
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets|favicon|logo).*)",
  ],
};
