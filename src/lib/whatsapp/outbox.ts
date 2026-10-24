import { randomUUID } from "node:crypto";
import connect from "@/lib/mongoose";
import { BotOutbound } from "@/lib/models/BotState";
import { normalizePhoneNumber, validPhone } from "./identity";
export async function enqueueMessage(
  to: string,
  text: string,
  id: string = randomUUID(),
  provider = process.env.WHATSAPP_PROVIDER || "bridge",
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
  await BotOutbound.updateOne(
    { _id: id },
    {
      $setOnInsert: {
        to: phone,
        text: text.trim(),
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
