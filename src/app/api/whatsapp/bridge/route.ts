import connect from "@/lib/mongoose";
import { verifyBridge } from "@/lib/security/bridge";
import { BotOutbound } from "@/lib/models/BotState";
import { getWhatsAppConfig } from "@/lib/models/WhatsAppConfig";
import { normalizePhoneNumber, validPhone } from "@/lib/whatsapp/identity";
import { processNextMessage } from "@/lib/whatsapp/inbox";
import { dispatchProviderMessages } from "@/lib/whatsapp/providers";
import { advanceDelivery, type DeliveryStatus } from "@/lib/whatsapp/delivery";
import { formatWhatsAppText } from "@/lib/whatsapp/format";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64000 || !verifyBridge(req, raw))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const body = JSON.parse(raw);
    await connect();
    const config = await getWhatsAppConfig();
    if (body.action === "process") {
      const processed = await processNextMessage();
      await dispatchProviderMessages();
      return Response.json({ success: true, processed });
    }
    let processed = false;
    if (body.action === "heartbeat" || body.action === "work") {
      const phone = normalizePhoneNumber(body.phone);
      if (body.connected && !validPhone(phone))
        return Response.json({ error: "Teléfono inválido" }, { status: 400 });
      config.botStatus = body.connected ? "online" : "offline";
      config.lastPingAt = new Date();
      if (body.connected) config.botPhone = phone;
      await config.save();
      if (body.action === "heartbeat") return Response.json({ success: true });
      if (
        body.connected ||
        (process.env.WHATSAPP_PROVIDER &&
          process.env.WHATSAPP_PROVIDER !== "bridge")
      ) {
        const ready = await BotOutbound.exists({
          provider: "bridge",
          status: { $in: ["queued", "sending", "submitted"] },
          attempts: { $lt: 5 },
          expiresAt: { $gt: new Date() },
          $or: [
            { leaseUntil: { $exists: false } },
            { leaseUntil: { $lte: new Date() } },
          ],
        });
        if (!ready) processed = await processNextMessage();
      }
      await dispatchProviderMessages();
    }
    if (body.action === "pull" || body.action === "work") {
      const messages = [];
      for (let i = 0; i < 5; i++) {
        const message = await BotOutbound.findOneAndUpdate(
          {
            provider: "bridge",
            status: { $in: ["queued", "sending", "submitted"] },
            attempts: { $lt: 5 },
            expiresAt: { $gt: new Date() },
            $or: [
              { leaseUntil: { $exists: false } },
              { leaseUntil: { $lte: new Date() } },
            ],
          },
          {
            $set: {
              status: "sending",
              leaseUntil: new Date(Date.now() + 90000),
            },
            $inc: { attempts: 1 },
          },
          { returnDocument: "after", sort: { createdAt: 1 } },
        ).lean();
        if (!message) break;
        messages.push({
          id: message._id,
          to: message.to,
          chatJid: message.chatJid,
          text: formatWhatsAppText(message.text),
        });
      }
      await BotOutbound.updateMany(
        {
          status: { $in: ["sending", "submitted"] },
          attempts: { $gte: 5 },
          leaseUntil: { $lt: new Date() },
        },
        {
          $set: {
            status: "failed",
            error: "Sin confirmación del puente después de 5 intentos",
          },
        },
      );
      return Response.json({ messages, processed });
    }
    if (
      ["ack", "receipt"].includes(body.action) &&
      typeof body.id === "string" &&
      body.id.length <= 300
    ) {
      if (
        body.action === "receipt" &&
        !["sent", "delivered", "read"].includes(body.status)
      )
        return Response.json({ error: "Estado inválido" }, { status: 400 });
      const status: DeliveryStatus =
        body.action === "receipt"
          ? body.status
          : body.success === true
            ? body.status === "submitted"
              ? "submitted"
              : "sent"
            : "failed";
      await advanceDelivery(body.id, status, String(body.providerId || ""));
      return Response.json({ success: true });
    }
    return Response.json({ error: "Acción inválida" }, { status: 400 });
  } catch {
    return Response.json(
      { error: "Error de comunicación con el puente" },
      { status: 500 },
    );
  }
}
