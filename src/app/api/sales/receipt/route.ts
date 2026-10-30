import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/security/admin";
import { atomicResponse } from "@/lib/security/atomic-response";
import { allowRequest } from "@/lib/security/limits";
import { Sale } from "@/lib/models/Sale";
import { BotOutbound } from "@/lib/models/BotState";
import { WhatsAppLog } from "@/lib/models/WhatsAppLog";
import { getWhatsAppConfig } from "@/lib/models/WhatsAppConfig";
import { enqueueMessage } from "@/lib/whatsapp/outbox";
import { customerPhone, saleReceiptText } from "@/lib/saleReceipt";
export const dynamic = "force-dynamic";
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
const key = (saleId: string, phone: string, text: string) =>
  "sale-receipt:" +
  createHash("sha256")
    .update(JSON.stringify([saleId, phone, text]))
    .digest("hex");
async function state(saleId: string) {
  const sale = await Sale.findById(saleId).lean();
  if (!sale) return null;
  const text = saleReceiptText(sale);
  const phone = sale.clientPhone || "";
  const message = phone
    ? await BotOutbound.findById(key(saleId, phone, text)).lean()
    : null;
  const log =
    !message && phone
      ? await WhatsAppLog.findOne({
          messageId: key(saleId, phone, text),
          actionExecuted: "COMPROBANTE_VENTA",
        }).lean()
      : null;
  const cfg = await getWhatsAppConfig();
  return {
    saleId,
    phone,
    preview: text,
    delivery: message
      ? {
          id: message._id,
          status:
            ["queued", "sending", "submitted"].includes(message.status) &&
            message.expiresAt &&
            message.expiresAt.getTime() <= Date.now()
              ? "expired"
              : message.status,
          to: message.to,
        }
      : log
        ? {
            id: log.messageId,
              status: ["queued", "sending", "submitted"].includes(log.status || "")
              ? "expired"
              : log.status,
            to: phone,
          }
        : null,
    botOnline:
      cfg.botStatus === "online" &&
      !!cfg.lastPingAt &&
      Date.now() - cfg.lastPingAt.getTime() < 60000,
  };
}
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const saleId = new URL(req.url).searchParams.get("saleId");
  if (!validId(saleId))
    return Response.json({ error: "Venta inválida" }, { status: 400 });
  try {
    const data = await state(saleId);
    return data
      ? Response.json(
          { success: true, ...data },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Venta no encontrada" }, { status: 404 });
  } catch {
    return Response.json(
      { error: "No se pudo consultar el comprobante" },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: { saleId?: unknown; phone?: unknown; retry?: boolean };
  let phone: string;
  try {
    body = await req.json();
    if (
      !body ||
      !validId(body.saleId) ||
      (body.retry !== undefined && typeof body.retry !== "boolean")
    )
      throw new Error("Venta inválida");
    phone = customerPhone(body.phone);
    if (!phone)
      throw new Error("Indica el WhatsApp del cliente antes de enviar.");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Solicitud inválida" },
      { status: 400 },
    );
  }
  if (!(await allowRequest("sale-receipt", 30, 60)))
    return Response.json(
      { error: "Demasiados envíos. Espera un momento." },
      { status: 429 },
    );
  return atomicResponse(async () => {
    const sale = await Sale.findById(body.saleId);
    if (!sale)
      return Response.json({ error: "Venta no encontrada" }, { status: 404 });
    const text = saleReceiptText(sale);
    const id = key(String(sale._id), phone, text);
    const previous = await BotOutbound.findById(id).lean();
    const logged = !previous
      ? await WhatsAppLog.findOne({
          messageId: id,
          actionExecuted: "COMPROBANTE_VENTA",
        }).lean()
      : null;
    if (
      !previous &&
      logged &&
      ["sent", "delivered", "read"].includes(logged.status || "")
    ) {
      if (sale.clientPhone !== phone) {
        sale.clientPhone = phone;
        await sale.save();
      }
      return Response.json(
        { success: true, ...(await state(String(sale._id))) },
        { status: 202 },
      );
    }
    const expired =
      previous &&
      ["queued", "sending", "submitted"].includes(previous.status) &&
      previous.expiresAt &&
      previous.expiresAt.getTime() <= Date.now();
    if ((previous?.status === "failed" || expired) && body.retry) {
      if (previous.providerId)
        return Response.json(
          {
            error:
              "El envío tiene una referencia de WhatsApp. Revisa la conversación antes de reenviarlo.",
          },
          { status: 409 },
        );
      await BotOutbound.updateOne(
        { _id: id, status: previous.status, providerId: { $in: ["", null] } },
        {
          $set: {
            status: "queued",
            attempts: 0,
            error: "",
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
          $unset: { leaseUntil: 1 },
        },
      );
    }
    await enqueueMessage(phone, text, id, "bridge");
    if (sale.clientPhone !== phone) {
      sale.clientPhone = phone;
      await sale.save();
    }
    const current = await BotOutbound.findById(id).lean();
    await WhatsAppLog.updateOne(
      { messageId: id },
      {
        $setOnInsert: {
          senderPhone: phone,
          role: "admin",
          direction: "manual",
          userMessage: `Comprobante #${sale.orderNumber}`,
          botReply: text,
          actionExecuted: "COMPROBANTE_VENTA",
          timestamp: new Date(),
          expiresAt: new Date(Date.now() + 90 * 86400000),
        },
        $set: { status: current?.status || "queued" },
      },
      { upsert: true },
    );
    return Response.json(
      { success: true, ...(await state(String(sale._id))) },
      { status: 202 },
    );
  });
}
