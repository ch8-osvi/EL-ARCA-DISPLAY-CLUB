import { requireAdmin } from "@/lib/security/admin";
import connect from "@/lib/mongoose";
import { getWhatsAppConfig } from "@/lib/models/WhatsAppConfig";
import { BotConversation, BotOperation } from "@/lib/models/BotState";
import { normalizePhoneNumber, validPhone } from "@/lib/whatsapp/identity";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await connect();
  const cfg = await getWhatsAppConfig();
  return Response.json({
    status: "ok",
    adminPhones: cfg.adminPhones,
    blacklistedPhones: cfg.blacklistedPhones,
    botPhone: cfg.botPhone,
    botStatus:
      cfg.botStatus === "online" &&
      cfg.lastPingAt &&
      Date.now() - cfg.lastPingAt.getTime() < 60000
        ? "online"
        : "offline",
    lastPingAt: cfg.lastPingAt,
    scanUrl:
      "http://127.0.0.1:" +
      String(process.env.LOCAL_BRIDGE_PORT || 7860) +
      "/scan",
  });
}
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const phone = normalizePhoneNumber(body.phone);
    if (!validPhone(phone))
      return Response.json(
        { error: "Usa el número completo con código de país (8–15 dígitos)" },
        { status: 400 },
      );
    await connect();
    const cfg = await getWhatsAppConfig();
    const owner = normalizePhoneNumber(process.env.ADMIN_PHONE_NUMBER || "");
    const before = {
      adminPhones: [...cfg.adminPhones],
      blacklistedPhones: [...cfg.blacklistedPhones],
    };
    if (body.action === "add_admin") {
      if (cfg.blacklistedPhones.includes(phone))
        return Response.json(
          { error: "Retira el bloqueo antes de dar permisos" },
          { status: 400 },
        );
      if (!cfg.adminPhones.includes(phone)) cfg.adminPhones.push(phone);
    } else if (body.action === "remove_admin") {
      if (phone === owner || cfg.adminPhones.length <= 1)
        return Response.json(
          {
            error:
              "No puedes eliminar al propietario o al último administrador",
          },
          { status: 400 },
        );
      cfg.adminPhones = cfg.adminPhones.filter((p) => p !== phone);
    } else if (body.action === "add_blacklist") {
      if (phone === owner || cfg.adminPhones.includes(phone))
        return Response.json(
          { error: "No se puede bloquear a un administrador" },
          { status: 400 },
        );
      if (!cfg.blacklistedPhones.includes(phone))
        cfg.blacklistedPhones.push(phone);
    } else if (body.action === "remove_blacklist")
      cfg.blacklistedPhones = cfg.blacklistedPhones.filter((p) => p !== phone);
    else if (["pause", "resume"].includes(body.action))
      await BotConversation.updateOne(
        { _id: phone },
        body.action === "pause"
          ? { $set: { paused: true }, $unset: { expiresAt: 1 } }
          : {
              $set: {
                paused: false,
                expiresAt: new Date(Date.now() + 86400000),
              },
            },
        { upsert: true },
      );
    else return Response.json({ error: "Acción inválida" }, { status: 400 });
    await cfg.save();
    await BotOperation.create({
      _id: randomUUID(),
      actor: "web-admin",
      actions: [{ type: body.action, phone }],
      before,
      after: {
        adminPhones: cfg.adminPhones,
        blacklistedPhones: cfg.blacklistedPhones,
      },
    });
    return Response.json({
      status: "success",
      adminPhones: cfg.adminPhones,
      blacklistedPhones: cfg.blacklistedPhones,
    });
  } catch {
    return Response.json(
      { error: "No se pudo actualizar la configuración" },
      { status: 500 },
    );
  }
}
