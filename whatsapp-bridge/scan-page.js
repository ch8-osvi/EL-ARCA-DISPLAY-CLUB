const escape = (s) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function scanPage({
  authorized = false,
  connected = false,
  phone = "",
  qrImage = "",
  error = "",
} = {}) {
  const content = !authorized
    ? `<span class="badge">ACCESO PRIVADO · SOLO ESTA PC</span><h1>Conecta tu WhatsApp</h1><p class="intro">Administra la conexión del asistente de El Arca desde tu equipo.</p><form method="post" action="/scan/login"><label for="key">Contraseña de acceso</label><input id="key" name="key" type="password" placeholder="Introduce tu contraseña" required autocomplete="current-password" minlength="8" aria-describedby="feedback">${error ? `<p id="feedback" role="alert" class="error">${escape(error)}</p>` : '<p id="feedback" class="help">Usa la contraseña configurada para este puente local.</p>'}<button type="submit">Entrar al panel <span>→</span></button></form>`
    : connected
      ? `<span class="badge online">● CONEXIÓN ACTIVA</span><h1>Tu asistente está conectado</h1><p class="intro">WhatsApp está vinculado a El Arca Display Club.</p><div class="status"><span>Número vinculado</span><strong>+${escape(phone)}</strong></div><p class="help">Mantén esta PC encendida y conectada a Internet para que el bot reciba y responda mensajes.</p>`
      : qrImage
        ? `<span class="badge">VINCULACIÓN SEGURA</span><h1>Escanea el código QR</h1><p class="intro">Abre WhatsApp en tu teléfono y entra en <strong>Dispositivos vinculados → Vincular dispositivo</strong>.</p><div class="qr"><img width="260" height="260" src="${escape(qrImage)}" alt="Código QR para vincular WhatsApp"></div><p class="help">El código se actualiza automáticamente. No lo compartas.</p>`
        : `<span class="badge">CONECTANDO</span><h1>Recuperando la conexión…</h1><p class="intro">Estamos intentando recuperar tu sesión existente. Esta pantalla se actualizará automáticamente.</p><p class="help">Si tarda demasiado, comprueba la conexión de la PC y el estado del dispositivo vinculado en tu teléfono.</p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${authorized ? '<meta http-equiv="refresh" content="15">' : ""}<title>El Arca · WhatsApp local</title><style>
*{box-sizing:border-box}body{margin:0;background:#07090e;color:#f7f7fb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:grid;place-items:center;padding:32px 20px;background-image:radial-gradient(ellipse at 50% 0,rgba(245,190,36,.08),transparent 65%)}main{width:100%;max-width:480px}.brand{text-align:center;color:#f4cd54;font-weight:800;font-size:14px;letter-spacing:.14em;margin-bottom:28px}.brand small{display:block;color:#8c93a5;font-size:10px;letter-spacing:.22em;margin-top:8px}.card{background:linear-gradient(145deg,#12151e,#0d1018);border:1px solid #ffffff13;border-radius:28px;padding:36px;box-shadow:0 24px 70px #0005}.badge{display:inline-block;color:#f4cd54;background:#e8b92d12;border:1px solid #e8b92d25;padding:7px 10px;border-radius:100px;font-size:10px;font-weight:800;letter-spacing:.07em}.online{color:#68e8b1;border-color:#68e8b130;background:#68e8b110}h1{font-size:28px;line-height:1.15;letter-spacing:-.035em;margin:22px 0 14px}.intro{color:#a1a7b6;font-size:14px;line-height:1.7;margin:0 0 28px}label{display:block;font-size:12px;color:#d4d7df;font-weight:700;margin-bottom:10px}input{width:100%;background:#090c13;color:white;border:1px solid #ffffff20;border-radius:13px;padding:15px;font:inherit;font-size:14px;outline:none}input:focus{border-color:#eac344;box-shadow:0 0 0 3px #eac34418}button{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;border-radius:13px;background:linear-gradient(115deg,#f5d766,#c99a24);color:#211a08;font-size:14px;font-weight:800;padding:16px 18px;cursor:pointer;margin-top:20px}button:hover{filter:brightness(1.08)}button:focus-visible{outline:3px solid white;outline-offset:4px}.help{color:#858d9e;font-size:12px;line-height:1.7;margin-top:13px}.error{color:#fda4af;font-size:13px;line-height:1.5}.status{border:1px solid #68e8b124;background:#68e8b108;border-radius:15px;padding:20px;margin-bottom:22px}.status span{display:block;color:#939dab;font-size:11px;margin-bottom:8px}.status strong{font-size:21px}.qr{background:white;border-radius:20px;padding:16px;width:fit-content;max-width:100%;margin:auto}.qr img{display:block;max-width:100%;height:auto}footer{text-align:center;color:#697283;font-size:11px;margin-top:24px;line-height:1.8}a{color:#dcc461;text-decoration:none}a:hover{text-decoration:underline}@media(max-width:420px){.card{padding:26px}h1{font-size:25px}}
</style></head><body><main><div class="brand">EL ARCA DISPLAY CLUB<small>ASISTENTE WHATSAPP</small></div><section class="card">${content}</section><footer>Conexión local protegida · El Arca<br><a href="https://elarca-displayclub.vercel.app/admin/whatsapp" rel="noreferrer">Volver al centro de operaciones ↗</a></footer></main></body></html>`;
}
module.exports = { scanPage };
