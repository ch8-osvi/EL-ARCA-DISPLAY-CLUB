# 📲 Microservicio WhatsApp Bridge - El Arca Display Club

Microservicio autónomo en Node.js que emula una sesión de **WhatsApp Web** mediante el protocolo open-source **Baileys**.
Permite conectar el número de la tienda (**+53 63657247**) con la IA de Google Gemini alojada en **Vercel**, reconociendo los comandos del administrador (**+53 52031972**).

---

## 🚀 Despliegue 100% Gratuito en Render.com (Paso a Paso)

### Paso 1: Crear una cuenta en Render
1. Entra a [render.com](https://render.com) y regístrate gratis con tu cuenta de GitHub.

### Paso 2: Crear un nuevo "Web Service"
1. En el Dashboard de Render, haz clic en **New +** y selecciona **Web Service**.
2. Conecta tu repositorio de GitHub: `ch8-osvi/EL-ARCA-DISPLAY-CLUB`.
3. Configura los siguientes campos:
   - **Name:** `el-arca-whatsapp-bridge`
   - **Region:** Selecciona la más cercana (ej: *Ohio (US East)* u *Oregon (US West)*).
   - **Branch:** `main`
   - **Root Directory:** `whatsapp-bridge` *(¡Muy importante! Indica que el microservicio está en esta subcarpeta)*.
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` ($0/mes)

### Paso 3: Configurar las Variables de Entorno (Environment Variables)
En la sección **Environment Variables** de Render, añade estas 5 variables:

| Variable | Valor |
| :--- | :--- |
| `MONGODB_URI` | *Pega tu misma cadena de conexión de MongoDB Atlas que usas en Vercel* |
| `VERCEL_WEBHOOK_URL` | `https://elarca-displayclub.vercel.app/api/whatsapp/webhook` |
| `BRIDGE_SECRET` | `el_arca_bridge_secret_2026` |
| `ADMIN_PHONE` | `5352031972` |
| `BOT_PHONE` | `5363657247` |
| `SCAN_ACCESS_KEY` | `elarca2026` |

4. Haz clic en **Create Web Service**. Render compilará e iniciará el servicio en ~1 minuto.

---

## 📲 Paso 4: Escanear el Código QR y Vincular

1. Una vez desplegado, Render te dará una URL pública (ejemplo: `https://el-arca-whatsapp-bridge.onrender.com`).
2. Abre en el navegador de tu móvil o computadora:
   `https://tu-servicio.onrender.com/scan?key=elarca2026`
3. Verás la pantalla oscura de El Arca Display Club con el código QR.
4. Abre WhatsApp en el teléfono **+53 63657247**, ve a **Dispositivos vinculados > Vincular un dispositivo** y escanea el QR.
5. ¡Listo! La pantalla cambiará a **"CONEXIÓN ACTIVA 24/7"**.
   - La sesión queda guardada automáticamente en tu **MongoDB Atlas**. Aunque Render reinicie el contenedor, **nunca perderás la sesión**.

---

## ⚡ Paso 5: Evitar que el servidor gratuito se duerma (Anti-Sleep 24/7)

El tier gratuito de Render se suspende si no recibe visitas en 15 minutos. Para mantenerlo activo 24/7 sin pagar nada:

1. Entra a [cron-job.org](https://cron-job.org) o [uptimerobot.com](https://uptimerobot.com) (ambos son 100% gratuitos).
2. Crea un monitor o cron job con la URL:
   `https://tu-servicio.onrender.com/ping`
3. Pon la frecuencia cada **10 minutos**.
4. ¡Con esto el bot responderá siempre en tiempo real a cualquier hora del día y la noche!

---

## 🧪 Pruebas de Funcionamiento

1. **Desde tu teléfono personal (+53 52031972):**
   - Escribe al WhatsApp del bot (`63657247`):
     `"cambiar precio de pantalla Redmi Note 11 a 28"`
   - La IA responderá confirmando el cambio y actualizando MongoDB de inmediato.
2. **Desde el teléfono de un cliente o amigo:**
   - Escribe al WhatsApp del bot (`63657247`):
     `"Hola, ¿tienen pantalla de Redmi Note 11 y a qué precio?"`
   - La IA responderá amablemente con el precio de catálogo y stock en tiempo real, sin revelar ningún dato interno.
