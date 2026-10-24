import { verifyBridge, verifyMeta } from "@/lib/security/bridge";
import { receiveMessage } from "@/lib/whatsapp/inbox";
import { allowRequest } from "@/lib/security/limits";
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { BotOutbound } from "@/lib/models/BotState";
import { processNextMessage } from "@/lib/whatsapp/inbox";
import { dispatchProviderMessages } from "@/lib/whatsapp/providers";
import connect from "@/lib/mongoose";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("hub.mode")) {
    if (
      process.env.WHATSAPP_VERIFY_TOKEN &&
      params.get("hub.mode") === "subscribe" &&
      params.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
    )
      return new Response(params.get("hub.challenge"), { status: 200 });
    return Response.json({ error: "Verificación rechazada" }, { status: 403 });
  }
  return Response.json({ service: "WhatsApp", status: "accepting_events" });
}
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 256000)
    return Response.json({ error: "Evento demasiado grande" }, { status: 413 });
  try {
    const body = JSON.parse(raw);
    const provider = process.env.WHATSAPP_PROVIDER || "bridge";
    if (body.source === "baileys_bridge") {
      if (provider !== "bridge" || !verifyBridge(req, raw))
        return Response.json({ error: "No autorizado" }, { status: 401 });
      if (
        !(await allowRequest(
          "inbound:" + String(body.senderPhone).slice(0, 30),
          60,
          60,
        ))
      )
        return Response.json({ error: "Límite temporal" }, { status: 429 });
      const id = await receiveMessage(
        body.messageId,
        body.senderPhone,
        body.userText || "",
      );
      return Response.json({ status: "queued", id }, { status: 202 });
    }
    // Alternate providers must be explicitly selected; never infer trust from payload fields.
    if (provider === "meta" && body.object === "whatsapp_business_account") {
      if (!verifyMeta(req, raw))
        return Response.json({ error: "Firma inválida" }, { status: 401 });
      await connect();
      for (const entry of body.entry || [])
        for (const change of entry.changes || [])
          for (const msg of change.value?.messages || []) {
            await receiveMessage(
              msg.id,
              msg.from,
              msg.text?.body || "[Mensaje no textual]",
              "meta",
            );
          }
      for (const entry of body.entry || [])
        for (const change of entry.changes || [])
          for (const status of change.value?.statuses || []) {
            if (["delivered", "read", "failed"].includes(status.status))
              await BotOutbound.updateOne(
                { provider: "meta", providerId: status.id },
                { $set: { status: status.status } },
              );
          }
      after(async () => {
        await processNextMessage();
        await dispatchProviderMessages();
      });
      return Response.json({ status: "queued" });
    }
    if (provider === "whapi") {
      const expected = Buffer.from(process.env.WHAPI_WEBHOOK_TOKEN || "");
      const supplied = Buffer.from(
        req.headers.get("authorization")?.replace(/^Bearer /, "") || "",
      );
      if (
        !expected.length ||
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      )
        return Response.json({ error: "No autorizado" }, { status: 401 });
      for (const msg of body.messages || (body.message ? [body.message] : [])) {
        if (
          msg.from_me ||
          /@(g\.us|newsletter|broadcast)/.test(msg.chat_id || "")
        )
          continue;
        await receiveMessage(
          msg.id,
          msg.from || msg.chat_id,
          msg.text?.body || msg.caption || "[Mensaje no textual]",
          "whapi",
        );
      }
      after(async () => {
        await processNextMessage();
        await dispatchProviderMessages();
      });
      return Response.json({ status: "queued" });
    }
    return Response.json({ error: "Proveedor no habilitado" }, { status: 403 });
  } catch {
    return Response.json(
      { error: "No se pudo almacenar el evento. Puede reintentarse." },
      { status: 503 },
    );
  }
}
