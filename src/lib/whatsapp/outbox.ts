import { randomUUID } from "node:crypto";
import connect from "@/lib/mongoose";
import { BotOutbound, BotInbox } from "@/lib/models/BotState";
import { normalizePhoneNumber, validPhone } from "./identity";
import { formatWhatsAppText } from "./format";
import { verifiedChatJid } from "./transport";
export async function enqueueMessage(
  to: string,
  text: string,
  id: string = randomUUID(),
  provider = process.env.WHATSAPP_PROVIDER || "bridge",
  replyChatJid?: string,
) {
  await connect();
  const phone = normalizePhoneNumber(to);
  if (
    !validPhone(phone) ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 20000
  )
    throw new Error("Destinatario o mensaje inválido");
  const previous =
    provider === "bridge" && !replyChatJid
      ? await BotInbox.findOne({ phone, provider, chatJid: { $exists: true } })
          .sort({ createdAt: -1 })
          .select("chatJid")
          .lean()
      : null;
  const chatJid =
    provider === "bridge"
      ? verifiedChatJid(phone, replyChatJid || previous?.chatJid)
      : undefined;
  await BotOutbound.updateOne(
    { _id: id },
    {
      $setOnInsert: {
        to: phone,
        text: formatWhatsAppText(text.trim()),
        ...(chatJid ? { chatJid } : {}),
        provider,
        status: "queued",
        attempts: 0,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    },
    { upsert: true },
  );
  return id;
}
