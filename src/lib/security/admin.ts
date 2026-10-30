import { createHash } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import connect from "@/lib/mongoose";
import { authenticated, sameOrigin } from "./session";
const schema = new Schema({ _id: String, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session =
  mongoose.models.AdminSession || mongoose.model("AdminSession", schema);
export function sessionToken(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("el_arca_admin_session="))
      ?.slice("el_arca_admin_session=".length) || ""
  );
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function registerSession(token: string) {
  await connect();
  await Session.create({
    _id: hash(token),
    expiresAt: new Date(Date.now() + 28800000),
  });
}
export async function revokeSession(req: Request) {
  await connect();
  await Session.deleteOne({ _id: hash(sessionToken(req)) });
}
export async function requireAdmin(req: Request) {
  if (!req || !(await authenticated(req)))
    return Response.json(
      { success: false, error: "Sesión expirada. Inicia sesión." },
      { status: 401 },
    );
  try {
    await connect();
    if (
      !(await Session.exists({
        _id: hash(sessionToken(req)),
        expiresAt: { $gt: new Date() },
      }))
    )
      return Response.json(
        { success: false, error: "Sesión revocada. Inicia sesión." },
        { status: 401 },
      );
  } catch {
    return Response.json(
      {
        success: false,
        error:
          "No se pudo verificar la sesión. Reintenta cuando se restablezca la conexión.",
      },
      { status: 503 },
    );
  }
  if (!["GET", "HEAD"].includes(req.method) && !sameOrigin(req))
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  return null;
}
