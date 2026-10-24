import { requireAdmin } from "@/lib/security/admin";
import { allowRequest } from "@/lib/security/limits";
import { enqueueMessage } from "@/lib/whatsapp/outbox";
import { WhatsAppLog } from "@/lib/models/WhatsAppLog";
import { normalizePhoneNumber } from "@/lib/whatsapp/identity";
import { formatWhatsAppText } from "@/lib/whatsapp/format";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    if (!(await allowRequest("manual-send", 30, 60)))
      return Response.json(
        { error: "Límite de envíos temporal" },
        { status: 429 },
      );
    const b = await req.json();
    if (typeof b.text !== "string" || b.text.length > 20000)
      return Response.json({ error: "Mensaje inválido" }, { status: 400 });
    const id = await enqueueMessage(
      b.to,
      b.text,
      typeof b.requestId === "string" &&
        /^[a-zA-Z0-9-]{10,100}$/.test(b.requestId)
        ? "manual:" + b.requestId
        : undefined,
    );
    await WhatsAppLog.updateOne(
      { messageId: id },
      {
        $setOnInsert: {
          senderPhone: normalizePhoneNumber(b.to),
          role: "admin",
          direction: "manual",
          userMessage: "Respuesta del equipo",
          botReply: formatWhatsAppText(b.text),
          actionExecuted: "RESPUESTA_MANUAL",
          status: "queued",
          timestamp: new Date(),
          expiresAt: new Date(Date.now() + 90 * 86400000),
        },
      },
      { upsert: true },
    );
    return Response.json(
      {
        success: true,
        status: "queued",
        id,
        message:
          "Mensaje en cola. La PC lo enviará cuando el bot esté conectado.",
      },
      { status: 202 },
    );
  } catch {
    return Response.json(
      { error: "No se pudo poner el mensaje en cola" },
      { status: 400 },
    );
  }
}
