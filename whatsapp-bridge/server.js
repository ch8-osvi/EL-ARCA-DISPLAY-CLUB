"use strict";
const path = require("node:path"),
  fs = require("node:fs/promises");
const { randomBytes, createHash } = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
require("dotenv").config({
  path: path.join(__dirname, "../.env.local"),
  quiet: true,
});
const express = require("express"),
  QRCode = require("qrcode"),
  pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  normalizeMessageContent,
} = require("@whiskeysockets/baileys");
const { authStore } = require("./auth-store");
const { messageStore } = require("./message-store");
const { scanPage } = require("./scan-page");
const { signedHeaders, equalSecret, extractText } = require("./security");
const PORT = Number(process.env.PORT || 7860),
  HOST = "127.0.0.1";
const SECRET = process.env.BRIDGE_SECRET || process.env.WHATSAPP_BRIDGE_SECRET;
const SCAN_KEY = process.env.SCAN_ACCESS_KEY;
const WEBHOOK =
  process.env.VERCEL_WEBHOOK_URL ||
  "https://elarca-displayclub.vercel.app/api/whatsapp/webhook";
if (!SECRET || SECRET.length < 32 || !SCAN_KEY || SCAN_KEY.length < 8)
  throw new Error(
    "Configura BRIDGE_SECRET (32+ caracteres) y SCAN_ACCESS_KEY (8+). Consulta README.",
  );
if (
  new URL(WEBHOOK).protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(new URL(WEBHOOK).hostname)
)
  throw new Error("El webhook remoto debe usar HTTPS");
const cloudUrl = WEBHOOK.replace(/\/webhook$/, "/bridge");
const AUTH = path.join(__dirname, "auth_session"),
  SPOOL = path.join(__dirname, "spool");
const retryMessages = messageStore(path.join(__dirname, "message-cache"));
const uiSession = randomBytes(32).toString("hex");
let nextPoll = 2500,
  workTimer = null;
const lidToPhone = new Map();
let sock = null,
  connected = false,
  phone = "",
  qr = "",
  stopping = false,
  reconnecting = false,
  backoff = 2000,
  working = false,
  submitting = false,
  lastError = "",
  lastHeartbeat = 0;
const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "2kb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  );
  if (
    req.headers.origin &&
    req.headers.origin !== "http://127.0.0.1:" + PORT &&
    req.headers.origin !== "http://localhost:" + PORT
  )
    return res.sendStatus(403);
  next();
});
app.get(["/", "/health", "/ping"], (req, res) =>
  res.json({
    service: "El Arca local bridge",
    connected,
    lastError: lastError ? "Se requiere revisión del registro local" : "",
    time: new Date().toISOString(),
  }),
);
let attempts = [];
app.post("/scan/login", (req, res) => {
  attempts = attempts.filter((t) => Date.now() - t < 900000);
  if (attempts.length >= 8)
    return res
      .status(429)
      .send(
        scanPage({
          error:
            "Demasiados intentos. Espera 15 minutos antes de volver a entrar.",
        }),
      );
  attempts.push(Date.now());
  if (!equalSecret(req.body.key, SCAN_KEY))
    return res
      .status(401)
      .send(
        scanPage({
          error:
            "Contraseña incorrecta. Comprueba la clave e inténtalo de nuevo.",
        }),
      );
  attempts = [];
  res.cookie("bridge_ui", uiSession, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 3600000,
  });
  res.redirect("/scan");
});
app.get("/scan", async (req, res) => {
  const authorized = (req.headers.cookie || "")
    .split(";")
    .some((c) => equalSecret(c.trim(), "bridge_ui=" + uiSession));
  res.send(
    scanPage({
      authorized,
      connected,
      phone,
      qrImage: authorized && qr ? await QRCode.toDataURL(qr) : "",
    }),
  );
});
// All outbound requests go through the authenticated cloud queue. No public /send or logout endpoint.
async function cloud(action) {
  const raw = JSON.stringify(action);
  const r = await fetch(cloudUrl, {
    method: "POST",
    headers: signedHeaders(raw, SECRET),
    body: raw,
    signal: AbortSignal.timeout(55000),
  });
  if (!r.ok) throw new Error("Cloud HTTP " + r.status);
  return r.json();
}
async function save(file, data) {
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(tmp, file);
}
async function flushIncoming() {
  if (submitting) return;
  submitting = true;
  try {
    for (const file of (await fs.readdir(SPOOL)).filter(
      (n) => n.startsWith("in-") && n.endsWith(".json"),
    )) {
      const target = path.join(SPOOL, file);
      const event = JSON.parse(await fs.readFile(target, "utf8"));
      const raw = JSON.stringify(event);
      const r = await fetch(WEBHOOK, {
        method: "POST",
        headers: signedHeaders(raw, SECRET),
        body: raw,
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error("Webhook HTTP " + r.status);
      await fs.unlink(target);
    }
  } finally {
    submitting = false;
  }
}
async function worker() {
  if (working || stopping) return;
  clearTimeout(workTimer);
  working = true;
  try {
    await flushIncoming();
    const { messages = [], processed = false } = await cloud({
      action: "work",
      connected,
      phone,
    });
    lastHeartbeat = Date.now();
    if (!connected) return;
    for (const message of messages) {
      const journal = path.join(
        SPOOL,
        "out-" +
          createHash("sha256").update(message.id).digest("hex") +
          ".json",
      );
      let state;
      try {
        state = JSON.parse(await fs.readFile(journal, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        state = { sent: 0 };
      }
      const chunks = message.text.match(/[\s\S]{1,3500}/g) || [];
      for (let i = state.sent; i < chunks.length; i++) {
        const id = createHash("sha256")
          .update(message.id + ":" + i)
          .digest("hex")
          .slice(0, 32)
          .toUpperCase();
        await retryMessages.put(id, { conversation: chunks[i] });
        const result = await sock.sendMessage(
          message.to + "@s.whatsapp.net",
          { text: chunks[i] },
          { messageId: id },
        );
        if (result?.message) await retryMessages.put(id, result.message);
        state = {
          sent: i + 1,
          providerId: result?.key?.id,
          updatedAt: Date.now(),
        };
        await save(journal, state);
      }
      await cloud({
        action: "ack",
        id: message.id,
        success: true,
        providerId: state.providerId,
      });
    }
    nextPoll =
      messages.length || processed ? 2500 : Math.min(15000, nextPoll + 2500);
    lastError = "";
  } catch (e) {
    lastError = e.message;
    console.warn("[Bridge]", e.message);
  } finally {
    working = false;
    if (!stopping) workTimer = setTimeout(worker, nextPoll).unref();
  }
}
async function start() {
  if (stopping || reconnecting) return;
  reconnecting = true;
  try {
    const { state, saveCreds } = await authStore(AUTH);
    const { version } = await fetchLatestBaileysVersion();
    const current = makeWASocket({
      version,
      auth: state,
      getMessage: (key) => retryMessages.get(key),
      logger: pino({ level: "error" }),
      syncFullHistory: false,
      browser: ["El Arca", "Chrome", "1.0"],
      shouldIgnoreJid: (jid) =>
        /@(g\.us|newsletter|broadcast)$/.test(jid || ""),
    });
    sock = current;
    current.ev.on("creds.update", () => saveCreds().catch(fatal));
    current.ev.on("connection.update", (update) => {
      if (current !== sock) return;
      if (update.qr) qr = update.qr;
      if (update.connection === "open") {
        connected = true;
        qr = "";
        phone =
          current.user?.id?.split(":")[0]?.split("@")[0]?.replace(/\D/g, "") ||
          "";
        backoff = 2000;
        console.log(
          "[WhatsApp] Conectado. Panel QR: http://127.0.0.1:" + PORT + "/scan",
        );
        void worker();
      }
      if (update.connection === "close") {
        connected = false;
        lastHeartbeat = 0;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.error(
            "[WhatsApp] Sesión cerrada desde el teléfono. Conserva una copia y retira auth_session para vincular de nuevo.",
          );
          return;
        }
        if (!stopping) {
          const delay = backoff;
          backoff = Math.min(60000, backoff * 2);
          setTimeout(() => start().catch(fatal), delay);
        }
      }
    });
    current.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        if (contact.lid && contact.id?.endsWith("@s.whatsapp.net"))
          lidToPhone.set(contact.lid, contact.id);
      }
    });
    current.ev.on("chats.phoneNumberShare", (event) => {
      if (event.lid && event.jid?.endsWith("@s.whatsapp.net"))
        lidToPhone.set(event.lid, event.jid);
    });
    current.ev.on("messages.upsert", async (event) => {
      try {
        if (event.type !== "notify") return;
        for (const msg of event.messages) {
          const jid = msg.key.remoteJid || "";
          if (msg.key.fromMe || /@(g\.us|newsletter|broadcast)$/.test(jid))
            continue;
          const alternative =
            msg.key.remoteJidAlt ||
            msg.key.participantPn ||
            msg.key.senderPn ||
            "";
          let sender = jid.endsWith("@s.whatsapp.net") ? jid : alternative;
          if (!sender.endsWith("@s.whatsapp.net")) {
            const resolved =
              await current.signalRepository?.lidMapping?.getPNForLID?.(jid);
            sender = resolved || "";
          }
          if (!sender && lidToPhone.has(jid)) sender = lidToPhone.get(jid);
          const senderPhone = sender.split("@")[0].replace(/\D/g, "");
          if (!/^\d{8,15}$/.test(senderPhone)) {
            console.warn(
              "[WhatsApp] Identidad pendiente de resolver; no se otorgan permisos a LIDs.",
            );
            continue;
          }
          const id = msg.key.id;
          if (!id) continue;
          const content = normalizeMessageContent(msg.message);
          if (!content) continue;
          const userText = extractText({ message: content }).slice(0, 20000);
          if (!userText) continue; // Protocol, receipts and reactions are not customer queries.
          const eventBody = {
            source: "baileys_bridge",
            senderPhone,
            userText,
            messageId: id,
          };
          if (content.audioMessage) {
            const media = content.audioMessage;
            const mimeType = (media.mimetype || "audio/ogg").split(";")[0].trim().toLowerCase();
            const maxBytes = 2 * 1024 * 1024;
            if (!/^audio\/(ogg|mpeg|mp3|mp4|wav|webm|flac|aac)$/.test(mimeType)) {
              eventBody.userText = "[Formato de audio no compatible. Pide reenviar una nota de voz de WhatsApp o escribir la consulta.]";
            } else if (
              Number(media.fileLength || 0) > maxBytes ||
              Number(media.seconds || 0) > 180
            ) {
              eventBody.userText =
                "[Nota de voz demasiado larga. Pide al usuario que envíe una nota de máximo tres minutos y 2 MB, o que escriba la consulta.]";
            } else {
              try {
                const stream = await downloadMediaMessage(
                  msg,
                  "stream",
                  { options: { timeout: 20000 } },
                  {
                    logger: pino({ level: "error" }),
                    reuploadRequest: current.updateMediaMessage,
                  },
                );
                const chunks = [];
                let length = 0;
                for await (const chunk of stream) {
                  length += chunk.length;
                  if (length > maxBytes) {
                    stream.destroy();
                    throw new Error("Audio supera 2 MB");
                  }
                  chunks.push(chunk);
                }
                eventBody.audio = {
                  data: Buffer.concat(chunks).toString("base64"),
                  mimeType,
                  seconds: Number(media.seconds || 0),
                };
                eventBody.userText = "[Nota de voz]";
              } catch {
                eventBody.userText =
                  "[No se pudo descargar la nota de voz. Pide reenviarla o escribir la consulta. No adivines su contenido.]";
              }
            }
          }
          const target = path.join(
            SPOOL,
            "in-" +
              createHash("sha256")
                .update(senderPhone + ":" + id)
                .digest("hex") +
              ".json",
          );
          await save(target, eventBody);
        }
        void flushIncoming().catch((e) =>
          console.warn("[Entrada pendiente]", e.message),
        );
      } catch (e) {
        console.warn("[Entrada]", e.message);
      }
    });
  } finally {
    reconnecting = false;
  }
}
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  connected = false;
  await cloud({ action: "heartbeat", connected: false, phone }).catch(() => {});
  sock?.end(new Error("Cierre del puente"));
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 3000).unref();
}
function fatal(e) {
  console.error("[Error fatal]", e?.message || "Error");
  void shutdown(1);
}
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
const server = app.listen(PORT, HOST, async () => {
  try {
    await fs.mkdir(SPOOL, { recursive: true });
    await retryMessages.prune();
    setInterval(
      () =>
        retryMessages
          .prune()
          .catch((e) => console.warn("[Retención local]", e.message)),
      3600000,
    ).unref();
    await start();
    void worker();
    console.log(
      "[Bridge] Solo acceso local: http://127.0.0.1:" + PORT + "/scan",
    );
  } catch (e) {
    fatal(e);
  }
});
server.on("error", fatal);
