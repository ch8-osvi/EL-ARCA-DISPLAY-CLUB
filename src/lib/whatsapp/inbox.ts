import connect from "@/lib/mongoose";
import mongoose, { Schema } from "mongoose";
import { BotInbox } from "@/lib/models/BotState";
import { processWhatsAppAiMessage, isPhoneAuthorizedAdmin } from "./service";
import { enqueueMessage } from "./outbox";
import { normalizePhoneNumber, validPhone } from "./identity";
import { validateAudio, type VoiceAudio } from "./audio";
import { WhatsAppLog } from "@/lib/models/WhatsAppLog";
import { interactionId, verifiedChatJid } from "./transport";
const lockSchema = new Schema({ _id: String, until: Date, owner: String });
const Lock =
  mongoose.models.BotConversationLock ||
  mongoose.model("BotConversationLock", lockSchema);
export async function receiveMessage(
  id: string,
  phone: string,
  text: string,
  provider = "bridge",
  audioInput?: VoiceAudio,
  replyChatJid?: string,
) {
  const audio = validateAudio(audioInput);
  await connect();
  const canonical = normalizePhoneNumber(phone);
  if (
    !validPhone(canonical) ||
    !id ||
    id.length > 200 ||
    typeof text !== "string" ||
    text.length > 20000
  )
    throw new Error("Mensaje inválido");
  const key = provider + ":" + canonical + ":" + id;
  const existing = await BotInbox.findById(key).select("status").lean();
  if (existing?.status === "completed") return key;
  const chatJid =
    provider === "bridge"
      ? verifiedChatJid(canonical, replyChatJid)
      : undefined;
  await WhatsAppLog.updateOne(
    { _id: interactionId(key) },
    {
      $setOnInsert: {
        messageId: key,
        senderPhone: canonical,
        role: (await isPhoneAuthorizedAdmin(canonical)) ? "admin" : "client",
        userMessage: text.trim() || "[Mensaje no textual]",
        botReply: "Pendiente de procesar…",
        status: "received",
        direction: "inbound",
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 90 * 86400000),
      },
    },
    { upsert: true },
  );
  await BotInbox.updateOne(
    { _id: key },
    {
      $setOnInsert: {
        phone: canonical,
        ...(chatJid ? { chatJid } : {}),
        text: text.trim(),
        ...(audio ? { audio } : {}),
        provider,
        status: "queued",
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    },
    { upsert: true },
  );
  return key;
}
export async function processNextMessage() {
  await connect();
  const now = new Date();
  const msg = await BotInbox.findOneAndUpdate(
    {
      attempts: { $lt: 5 },
      expiresAt: { $gt: now },
      $or: [
        { status: "queued" },
        { status: "processing", leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: "processing", leaseUntil: new Date(Date.now() + 120000) },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { createdAt: 1 } },
  );
  if (!msg) return false;
  let owned = false;
  try {
    try {
      const lock = await Lock.findOneAndUpdate(
        { _id: msg.phone, $or: [{ until: { $lt: now } }, { owner: msg._id }] },
        { $set: { until: new Date(Date.now() + 120000), owner: msg._id } },
        { upsert: true, returnDocument: "after" },
      );
      owned = !!lock;
    } catch (err: any) {
      if (err.code !== 11000) throw err;
    }
    if (!owned) {
      await BotInbox.updateOne(
        { _id: msg._id },
        {
          $set: { status: "queued" },
          $inc: { attempts: -1 },
          $unset: { leaseUntil: 1 },
        },
      );
      return false;
    }
    await WhatsAppLog.updateOne(
      { messageId: msg._id },
      { $set: { status: "processing", botReply: "Preparando respuesta…" } },
    );
    const reply = await processWhatsAppAiMessage(
      msg.text ||
        "El cliente envió un mensaje no textual. Solicita que describa por texto su consulta.",
      msg.phone,
      { requestId: msg._id, audio: msg.audio },
    );
    if (reply)
      await enqueueMessage(
        msg.phone,
        reply,
        "reply:" + msg._id,
        msg.provider,
        msg.chatJid,
      );
    await WhatsAppLog.updateOne(
      { messageId: msg._id },
      {
        $set: reply
          ? {
              outboundId: "reply:" + msg._id,
              status: "queued",
              direction: "automatic",
            }
          : {
              status: "not_replied",
              direction: "inbound",
              botReply: "Sin respuesta automática (bloqueo o atención humana)",
            },
      },
    );
    await BotInbox.updateOne(
      { _id: msg._id },
      {
        $set: { status: "completed", reply },
        $unset: { leaseUntil: 1, error: 1, audio: 1 },
      },
    );
    return true;
  } catch {
    await WhatsAppLog.updateOne(
      { messageId: msg._id },
      {
        $set: {
          status: msg.attempts >= 5 ? "failed" : "received",
          botReply:
            msg.attempts >= 5
              ? "No se pudo procesar. Requiere revisión."
              : "No se pudo preparar la respuesta. Reintentando…",
        },
      },
    );
    await BotInbox.updateOne(
      { _id: msg._id },
      {
        $set: {
          status: msg.attempts >= 5 ? "failed" : "queued",
          error: "No se pudo procesar; revisar antes de reintentar",
        },
        $unset: { leaseUntil: 1 },
      },
    );
    throw new Error("No se pudo procesar el mensaje");
  } finally {
    if (owned) await Lock.deleteOne({ _id: msg.phone, owner: msg._id });
  }
}
