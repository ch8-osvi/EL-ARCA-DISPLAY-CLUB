import { createHash } from "node:crypto";
export const interactionId = (id: string) =>
  createHash("sha256")
    .update("whatsapp-log:" + id)
    .digest("hex")
    .slice(0, 24);
/** This is transport metadata from the signed bridge, never an authorization identity. */
export function verifiedChatJid(phone: string, jid?: string) {
  if (!jid) return undefined;
  const chat = jid.replace(/:\d+@/, "@");
  if (chat === phone + "@s.whatsapp.net" || /^\d{5,20}@lid$/.test(chat))
    return chat;
  throw new Error("Destino de conversación inválido");
}
