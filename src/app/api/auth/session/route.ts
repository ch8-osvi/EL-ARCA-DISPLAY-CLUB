import { timingSafeEqual } from "node:crypto";
import {
  createSession,
  sameOrigin,
  SESSION_COOKIE,
} from "@/lib/security/session";
import { allowRequest } from "@/lib/security/limits";
import {
  registerSession,
  revokeSession,
  requireAdmin,
} from "@/lib/security/admin";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return Response.json(
    { authenticated: !(await requireAdmin(req)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  if (
    !(await allowRequest(
      "login:" + (req.headers.get("x-forwarded-for")?.split(",")[0] || "local"),
      8,
      900,
    ))
  )
    return Response.json(
      { error: "Demasiados intentos. Espera 15 minutos." },
      { status: 429 },
    );
  try {
    const body = await req.json(),
      expected = process.env.ADMIN_PASSWORD;
    if (!expected || expected.length < 12)
      return Response.json(
        { error: "Acceso administrativo pendiente de configurar" },
        { status: 503 },
      );
    const a = Buffer.from(
        typeof body.password === "string" ? body.password : "",
      ),
      b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
    const token = await createSession();
    await registerSession(token);
    return Response.json(
      { authenticated: true },
      {
        headers: {
          "Set-Cookie":
            SESSION_COOKIE +
            "=" +
            token +
            "; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800" +
            (new URL(req.url).protocol === "https:" ? "; Secure" : ""),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req))
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  await revokeSession(req);
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "Set-Cookie":
          SESSION_COOKIE +
          "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" +
          (new URL(req.url).protocol === "https:" ? "; Secure" : ""),
      },
    },
  );
}
