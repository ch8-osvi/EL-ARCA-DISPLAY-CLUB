const {
  generateWAMessage,
  generateMessageIDV2,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
async function sendQueuedText({ sock, message, state, cache, saveState }) {
  if (!state.providerId) {
    state.providerId = generateMessageIDV2(sock.user.id);
    await saveState(state);
  }
  const stored = await cache.getRecord(state.providerId);
  if (stored?.metadata?.outboundId && stored.metadata.outboundId !== message.id)
    throw new Error("El identificador de entrega pertenece a otro mensaje");
  const jid =
    stored?.metadata?.jid || message.chatJid || message.to + "@s.whatsapp.net";
  const content =
    stored?.message ||
    (
      await generateWAMessage(
        jid,
        { text: message.text },
        {
          userJid: sock.user.id,
          messageId: state.providerId,
          logger: pino({ level: "silent" }),
        },
      )
    ).message;
  await cache.put(state.providerId, content, {
    outboundId: message.id,
    submittedAt: Date.now(),
    jid,
  });
  await sock.relayMessage(jid, content, {
    messageId: state.providerId,
    useUserDevicesCache: false,
  });
  state.sent = 1;
  state.updatedAt = Date.now();
  await saveState(state);
  return {
    id: state.providerId,
    addressType: jid.endsWith("@lid") ? "lid" : "phone",
  };
}
module.exports = { sendQueuedText };
