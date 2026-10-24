// Protección global contra excepciones no capturadas de WebSocket/Baileys
process.on('unhandledRejection', (reason) => {
  console.warn('[Bridge Safe Handler] Unhandled Rejection amortiguado:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.warn('[Bridge Safe Handler] Uncaught Exception amortiguado:', err.message);
});

const path = require('path');
const fs = require('fs');

// Cargar variables de entorno (desde whatsapp-bridge/.env o desde raíz .env.local)
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
}

const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const { MongoClient } = require('mongodb');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

// Configuración de Entorno
const PORT = process.env.PORT || 7860;
const MONGODB_URI = process.env.MONGODB_URI || '';
const VERCEL_WEBHOOK_URL =
  process.env.VERCEL_WEBHOOK_URL ||
  'https://elarca-displayclub.vercel.app/api/whatsapp/webhook';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'el_arca_bridge_secret_2026';
const ADMIN_PHONE = (process.env.ADMIN_PHONE || '5352031972').replace(/\D/g, '');
const BOT_PHONE = (process.env.BOT_PHONE || '5363657247').replace(/\D/g, '');
const SCAN_ACCESS_KEY = process.env.SCAN_ACCESS_KEY || 'elarca2026';

// Directorio temporal para almacenar credenciales sincronizadas con MongoDB
const AUTH_DIR = path.join(__dirname, 'auth_session');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Variables de estado en memoria
let currentQR = null;
let currentQRDataUrl = null;
let isConnected = false;
let connectedPhone = null;
let socketInstance = null;
let mongoClient = null;
let mongoDb = null;

// =============================================================================
// PERSISTENCIA MONGODB ATLAS (Restauración y Sincronización de Sesión)
// =============================================================================
async function initMongo() {
  if (!MONGODB_URI) {
    console.warn('[MongoDB] MONGODB_URI no está configurada. La sesión se guardará solo en disco local.');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db();
    console.log('[MongoDB] Conexión establecida con MongoDB Atlas para persistencia de sesión.');

    // Restaurar archivos de sesión desde MongoDB si existen
    const col = mongoDb.collection('whatsapp_auth_keys');
    const files = await col.find({}).toArray();
    if (files && files.length > 0) {
      console.log(`[MongoDB] Restaurando ${files.length} archivos de sesión guardados...`);
      for (const item of files) {
        const filePath = path.join(AUTH_DIR, item.filename);
        fs.writeFileSync(filePath, item.content, 'utf8');
      }
      console.log('[MongoDB] Sesión restaurada con éxito.');
    }
  } catch (err) {
    console.error('[MongoDB Error al conectar]', err.message);
  }
}

// Guarda un archivo de sesión en MongoDB Atlas
async function syncFileToMongo(filename) {
  if (!mongoDb) return;
  try {
    const filePath = path.join(AUTH_DIR, filename);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const col = mongoDb.collection('whatsapp_auth_keys');
    await col.updateOne(
      { filename },
      { $set: { filename, content, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.warn(`[MongoDB Sync Warning] No se pudo guardar ${filename}:`, err.message);
  }
}

// Limpia las credenciales en MongoDB al desvincular
async function clearMongoSession() {
  if (!mongoDb) return;
  try {
    const col = mongoDb.collection('whatsapp_auth_keys');
    await col.deleteMany({});
    console.log('[MongoDB] Sesión borrada de MongoDB Atlas.');
  } catch (err) {
    console.error('[MongoDB Error]', err.message);
  }
}

// =============================================================================
// SERVIDOR WEB EXPRESS (Endpoints de Monitoreo, Ping y Escaneo de QR)
// =============================================================================
const app = express();
app.use(express.json());

// Endpoint de liveness y ping para que Render nunca se duerma
app.get(['/', '/ping', '/health'], (req, res) => {
  res.json({
    status: 'online',
    service: 'El Arca Display Club - WhatsApp Bridge',
    connected: isConnected,
    botPhone: connectedPhone || BOT_PHONE,
    adminPhone: ADMIN_PHONE,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint visual para escanear el QR desde el teléfono o navegador
app.get('/scan', async (req, res) => {
  const userKey = req.query.key || req.query.pin;
  if (SCAN_ACCESS_KEY && userKey !== SCAN_ACCESS_KEY) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Acceso Restringido</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; text-align: center; max-width: 400px; }
          input { width: 80%; padding: 10px; margin: 15px 0; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; text-align: center; font-size: 1.1rem; }
          button { background: #eab308; color: #000; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🔒 El Arca Display Club</h2>
          <p>Introduce la clave de acceso para vincular WhatsApp:</p>
          <form method="GET" action="/scan">
            <input type="password" name="key" placeholder="Clave de acceso" autofocus required>
            <br>
            <button type="submit">Entrar</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  // Si ya está conectado
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>WhatsApp Conectado - El Arca</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
          .card { background: #131c2e; border: 1px solid #233554; border-radius: 16px; padding: 2.5rem 2rem; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); padding: 6px 16px; border-radius: 9999px; font-weight: 700; font-size: 0.95rem; margin-bottom: 1.5rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.6rem; color: #f8fafc; }
          p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0.5rem 0 1.5rem 0; }
          .info-box { background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; padding: 1rem; text-align: left; margin-bottom: 1.5rem; font-size: 0.9rem; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
          .info-row:last-child { margin-bottom: 0; }
          .info-label { color: #64748b; }
          .info-val { color: #e2e8f0; font-weight: 600; font-family: monospace; }
          .btn-logout { background: transparent; border: 1px solid #ef4444; color: #f87171; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
          .btn-logout:hover { background: #ef4444; color: #fff; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">
            <span style="font-size: 1.2rem;">●</span> CONEXIÓN ACTIVA 24/7
          </div>
          <h1>El Arca Display Club</h1>
          <p>La IA de WhatsApp está operativa y respondiendo consultas de clientes y órdenes de administrador.</p>
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">📱 Bot Vinculado:</span>
              <span class="info-val">+${connectedPhone || BOT_PHONE}</span>
            </div>
            <div class="info-row">
              <span class="info-label">👑 Teléfono Admin:</span>
              <span class="info-val">+${ADMIN_PHONE}</span>
            </div>
            <div class="info-row">
              <span class="info-label">🧠 Motor IA:</span>
              <span class="info-val">Google Gemini + Vercel</span>
            </div>
            <div class="info-row">
              <span class="info-label">💾 Sesión:</span>
              <span class="info-val">Guardada en MongoDB Atlas</span>
            </div>
          </div>
          <form method="POST" action="/logout?key=${encodeURIComponent(userKey || '')}" onsubmit="return confirm('¿Seguro que deseas desvincular la sesión de WhatsApp?');">
            <button type="submit" class="btn-logout">Desvincular WhatsApp</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  // Si está esperando escanear el QR
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Vincular WhatsApp - El Arca</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="12">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
        .card { background: #131c2e; border: 1px solid #233554; border-radius: 16px; padding: 2.5rem 2rem; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(234,179,8,0.15); color: #facc15; border: 1px solid rgba(234,179,8,0.3); padding: 6px 16px; border-radius: 9999px; font-weight: 700; font-size: 0.9rem; margin-bottom: 1.5rem; }
        h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; color: #f8fafc; }
        p { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; margin: 0.5rem 0 1.5rem 0; }
        .qr-wrapper { background: #ffffff; padding: 16px; border-radius: 12px; display: inline-block; box-shadow: 0 8px 24px rgba(0,0,0,0.4); margin-bottom: 1.5rem; }
        .qr-wrapper img { display: block; max-width: 250px; width: 100%; height: auto; }
        .steps { background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; padding: 1rem; text-align: left; font-size: 0.85rem; color: #cbd5e1; }
        .steps ol { margin: 0; padding-left: 1.2rem; }
        .steps li { margin-bottom: 0.4rem; }
        .steps li:last-child { margin-bottom: 0; }
        .footer-note { font-size: 0.75rem; color: #64748b; margin-top: 1rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">
          ⏳ ESPERANDO VINCULACIÓN
        </div>
        <h1>Vincular WhatsApp</h1>
        <p>Abre WhatsApp en el teléfono de la tienda (<strong>+53 ${BOT_PHONE}</strong>) y escanea este código QR:</p>
        
        <div class="qr-wrapper">
          ${
            currentQRDataUrl
              ? `<img src="${currentQRDataUrl}" alt="Código QR de WhatsApp" />`
              : `<div style="padding: 40px; color: #64748b; font-weight: bold;">Generando código QR...<br><small>Recarga en unos segundos</small></div>`
          }
        </div>

        <div class="steps">
          <ol>
            <li>Abre <strong>WhatsApp</strong> en el móvil <strong>+53 ${BOT_PHONE}</strong></li>
            <li>Toca los tres puntos (⋮) o Configuración</li>
            <li>Selecciona <strong>Dispositivos vinculados</strong></li>
            <li>Toca en <strong>Vincular un dispositivo</strong> y apunta la cámara a esta pantalla</li>
          </ol>
        </div>

        <div class="footer-note">
          Esta página se actualiza automáticamente cada 12 segundos.
        </div>
      </div>
    </body>
    </html>
  `);
});

// Endpoint para desvincular sesión manualmente
app.post('/logout', async (req, res) => {
  const userKey = req.query.key || req.query.pin;
  if (SCAN_ACCESS_KEY && userKey !== SCAN_ACCESS_KEY) {
    return res.status(401).send('No autorizado');
  }
  try {
    if (socketInstance) {
      await socketInstance.logout();
    }
    // Limpiar archivos locales y en MongoDB
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await clearMongoSession();

    isConnected = false;
    connectedPhone = null;
    currentQR = null;
    currentQRDataUrl = null;

    setTimeout(() => {
      startBaileysSocket();
    }, 2000);

    res.redirect(`/scan?key=${encodeURIComponent(userKey || '')}`);
  } catch (err) {
    res.status(500).send('Error al desvincular: ' + err.message);
  }
});

// Endpoint para enviar mensaje proactivo vía HTTP POST
app.post('/send', async (req, res) => {
  const { secret, to, text } = req.body || {};
  if (secret !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized bridge request' });
  }
  if (!isConnected || !socketInstance) {
    return res.status(503).json({ error: 'WhatsApp is not connected' });
  }
  if (!to || !text) {
    return res.status(400).json({ error: 'Missing to or text' });
  }

  try {
    const cleanTo = to.replace(/\D/g, '');
    const jid = cleanTo.includes('@') ? cleanTo : `${cleanTo}@s.whatsapp.net`;
    await socketInstance.sendMessage(jid, { text });
    res.json({ status: 'sent', to: cleanTo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor HTTP
app.listen(PORT, async () => {
  console.log(`[Bridge Web Server] Escuchando en puerto ${PORT}`);
  await initMongo();
  startBaileysSocket();
});

// =============================================================================
// MOTOR BAILEYS (Conexión WebSocket con WhatsApp Web)
// =============================================================================
async function startBaileysSocket() {
  console.log('[Baileys] Inicializando socket de WhatsApp...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Baileys] Usando versión de WhatsApp Web v${version.join('.')} (Última: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    browser: ['El Arca Display Club', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  socketInstance = sock;

  // Actualización de credenciales y sincronización con MongoDB
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    // Guardar creds.json y archivos modificados en MongoDB
    try {
      const files = fs.readdirSync(AUTH_DIR);
      for (const f of files) {
        await syncFileToMongo(f);
      }
    } catch (err) {
      console.warn('[Sync Error]', err.message);
    }
  });

  // Manejo de eventos de conexión y QR
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      try {
        currentQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
      } catch (err) {
        console.error('[QR Error]', err);
      }
      console.log('[Baileys] 📲 Nuevo código QR generado. Escanéalo en la terminal o abre /scan');
    }

    if (connection === 'open') {
      isConnected = true;
      currentQR = null;
      currentQRDataUrl = null;
      connectedPhone = sock.user?.id ? sock.user.id.split(':')[0].replace(/\D/g, '') : BOT_PHONE;
      console.log(`[Baileys] ✅ Conectado exitosamente a WhatsApp con el número: +${connectedPhone}`);
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[Baileys] Conexión cerrada. Código: ${statusCode} | ¿Reconectar?: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        console.log('[Baileys] Reconectando en 5 segundos...');
        setTimeout(() => startBaileysSocket(), 5000);
      } else {
        console.warn('[Baileys] Sesión cerrada en el teléfono. Por favor escanea el QR nuevamente.');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        await clearMongoSession();
        setTimeout(() => startBaileysSocket(), 2000);
      }
    }
  });

  // Mapeo dinámico y universal de WhatsApp LID -> Teléfono Real
  const dynamicLidToPhone = new Map([['113198191661280', ADMIN_PHONE || '5352031972']]);

  // Captura eventos de intercambio de número de teléfono y contactos para resolver cualquier LID a teléfono
  sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
    if (lid && jid) {
      const cleanLid = lid.split('@')[0].replace(/\D/g, '');
      const cleanPhone = jid.split('@')[0].replace(/\D/g, '');
      if (cleanLid && cleanPhone) {
        dynamicLidToPhone.set(cleanLid, cleanPhone);
        console.log(`[Baileys LID Resuelto] ${cleanLid} -> +${cleanPhone}`);
      }
    }
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.id) {
        const cleanLid = c.lid.split('@')[0].replace(/\D/g, '');
        const cleanPhone = c.id.split('@')[0].replace(/\D/g, '');
        if (cleanLid && cleanPhone) {
          dynamicLidToPhone.set(cleanLid, cleanPhone);
        }
      }
    }
  });

  // ===========================================================================
  // MENSAJES ENTRANTES (Reenvío a Vercel Webhook + Gemini)
  // ===========================================================================
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Ignorar mensajes enviados por el propio bot para evitar bucles infinitos
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid || '';

      // Ignorar mensajes de grupos, canales/newsletters o estados/stories
      if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter') || remoteJid.includes('@broadcast')) continue;

      let senderPhone = remoteJid.split('@')[0].replace(/\D/g, '');
      const rawLid = remoteJid.endsWith('@lid') ? senderPhone : null;

      // Si Baileys incluye número alternativo en el mensaje o fue resuelto dinámicamente
      const altJid = msg.key.remoteJidAlt || msg.key.participantPn || msg.key.senderPn || '';
      if (altJid && (altJid.includes('@s.whatsapp.net') || /^\d+$/.test(altJid))) {
        senderPhone = altJid.split('@')[0].replace(/\D/g, '');
      } else if (rawLid && dynamicLidToPhone.has(rawLid)) {
        senderPhone = dynamicLidToPhone.get(rawLid);
      }

      // Extraer texto del mensaje
      const userText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      if (!userText.trim()) continue;

      console.log(`[Inbound WhatsApp] De: +${senderPhone}${rawLid ? ` (LID: ${rawLid})` : ''} | Mensaje: "${userText}"`);

      // Enviar a Vercel Webhook para procesamiento con Gemini y MongoDB
      try {
        const response = await fetch(VERCEL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'baileys_bridge',
            secret: BRIDGE_SECRET,
            senderPhone,
            senderLid: rawLid,
            chatId: remoteJid,
            userText: userText.trim(),
            messageId: msg.key.id,
          }),
        });

        if (!response.ok) {
          console.error(`[Vercel Webhook Error] Status ${response.status}`);
          continue;
        }

        const data = await response.json();

        // Si Vercel devuelve una respuesta generada por la IA
        if (data && data.reply && typeof data.reply === 'string') {
          console.log(`[Outbound Reply] Enviando respuesta a +${senderPhone}...`);
          await sock.sendMessage(
            remoteJid,
            { text: data.reply },
            { quoted: msg }
          );
          console.log(`[Outbound Reply] Enviado con éxito.`);
        }
      } catch (err) {
        console.error('[Error al comunicarse con Vercel Webhook]', err.message);
      }
    }
  });
}
