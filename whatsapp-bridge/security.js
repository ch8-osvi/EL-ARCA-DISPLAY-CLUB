const { createHmac, timingSafeEqual } = require("node:crypto");
function signedHeaders(raw, secret, now = Date.now()) {
  const timestamp = String(now);
  return {
    "Content-Type": "application/json",
    "x-bridge-timestamp": timestamp,
    "x-bridge-signature": createHmac("sha256", secret)
      .update(timestamp + "." + raw)
      .digest("hex"),
  };
}
function equalSecret(a, b) {
  const x = Buffer.from(String(a || "")),
    y = Buffer.from(String(b || ""));
  return x.length === y.length && y.length > 0 && timingSafeEqual(x, y);
}
function extractText(msg) {
  const m = msg?.message;
  if (!m) return "";
  if (m.ephemeralMessage)
    return extractText({ message: m.ephemeralMessage.message });
  if (m.viewOnceMessage)
    return extractText({ message: m.viewOnceMessage.message });
  if (m.viewOnceMessageV2)
    return extractText({ message: m.viewOnceMessageV2.message });
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    (m.audioMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.documentMessage ||
    m.stickerMessage
      ? "[Mensaje no textual: solicita al cliente una descripción por escrito]"
      : "")
  );
}
module.exports = { signedHeaders, equalSecret, extractText };
