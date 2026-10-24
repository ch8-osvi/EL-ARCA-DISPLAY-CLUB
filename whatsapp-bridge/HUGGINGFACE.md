# 🚀 Guía Definitiva: WhatsApp AI en Hugging Face Spaces (100% Gratis y 24/7)

## ¿Es lo mismo? ¿Se pierde alguna función? ¿Cobra? ¿Es mejor o peor?

| Pregunta | Respuesta Real |
| :--- | :--- |
| **¿Pierdo alguna función?** | **No, ninguna.** Es exactamente el mismo código de Baileys, MongoDB Atlas y Gemini. Reconoce al Admin (+53 52031972) y atiende a clientes (+53 63657247) con la misma rapidez. |
| **¿Cobra algo?** | **$0.00 Totalmente GRATIS para siempre.** Hugging Face no pide tarjeta de crédito bancaria para usar la capa gratuita de Spaces. |
| **¿Es mejor o peor que Render?** | **Es MUCHO MEJOR que Render:**<br>1. **No se duerme:** En Render el bot se apaga a los 15 minutos sin visitas. En Hugging Face se mantiene despierto 24/7.<br>2. **Mucho más potente:** Te da **2 CPUs y 16 GB de memoria RAM** (Render solo daba 512 MB).<br>3. **Cero bloqueos para Cuba:** Te registras con Google o GitHub en 2 segundos sin líos de correos que no llegan. |

---

## 📋 Tutorial Paso a Paso (Modo Fácil Visual - 3 Minutos)

### Paso 1: Registrarse en Hugging Face
1. Entra en tu navegador a: **[huggingface.co/join](https://huggingface.co/join)**
2. Haz clic en el botón **Sign up with GitHub** o regístrate con tu correo de Google. La entrada es inmediata.

---

### Paso 2: Crear el nuevo Space
1. Una vez dentro, haz clic arriba a la derecha en tu foto de perfil y selecciona:  
   👉 **+ New Space** (o entra directo a [huggingface.co/new-space](https://huggingface.co/new-space)).
2. Configura los campos exactamente así:
   - **Space name:** `el-arca-whatsapp-bot`
   - **License:** `mit` (o déjalo en none)
   - **Select the Space SDK:** Selecciona **Docker** 🐳 *(muy importante: elige **Blank**)*.
   - **Space hardware:** Selecciona **Free (2 vCPU · 16 GB · CPU basic)**
   - **Visibility:** Selecciona **Public** *(necesario para poder abrir la página del QR)*.
3. Haz clic en el botón final: **Create Space**.

---

### Paso 3: Configurar las Variables Secretas (Variables de Entorno)
Antes de subir los archivos, vamos a poner las claves:
1. En tu nuevo Space, haz clic en la pestaña **Settings** (arriba a la derecha).
2. Baja hasta la sección que dice **Variables and secrets**.
3. Haz clic en **New secret** y agrega una por una estas variables (son 6):

| Name (Nombre del Secret) | Value (Valor) |
| :--- | :--- |
| `MONGODB_URI` | *(Pega tu cadena completa de MongoDB Atlas que usas en Vercel)* |
| `VERCEL_WEBHOOK_URL` | `https://elarca-displayclub.vercel.app/api/whatsapp/webhook` |
| `BRIDGE_SECRET` | `el_arca_bridge_secret_2026` |
| `ADMIN_PHONE` | `5352031972` |
| `BOT_PHONE` | `5363657247` |
| `SCAN_ACCESS_KEY` | `elarca2026` |

---

### Paso 4: Subir los 3 Archivos del Bot (Arrastrar y Soltar)
1. En tu Space, haz clic en la pestaña **Files** (al lado de App y Community).
2. Haz clic en **Add file > Upload files**.
3. Arrastra o selecciona estos 3 archivos que están en tu carpeta `whatsapp-bridge` de tu computadora:
   - `package.json`
   - `server.js`
   - `Dockerfile`
4. En el campo de abajo que dice *"Commit changes to main"*, haz clic en el botón verde **Commit changes to main**.

---

### Paso 5: ¡Listo! El Space se compilará solo
- Hugging Face detectará el Dockerfile, instalará las librerías e iniciará el servidor en ~45 segundos.
- Verás que el estado arriba cambia a **Running** (en color verde).

---

### Paso 6: Escanear el Código QR con WhatsApp
1. Haz clic en la pestaña **App** de tu Space.
2. Para verlo en pantalla completa con tu clave de seguridad, haz clic en los 3 puntitos arriba a la derecha de la ventana y selecciona **"Embed this Space"** o abre directamente la URL de tu Space agregando `/scan?key=elarca2026`.
   - Ejemplo: `https://tu-usuario-el-arca-whatsapp-bot.hf.space/scan?key=elarca2026`
3. Verás la pantalla con el código QR de El Arca Display Club.
4. Abre WhatsApp en el móvil de la tienda (**+53 63657247**):
   - Ve a **Dispositivos vinculados > Vincular un dispositivo**.
   - Apunta la cámara al código QR.
5. La pantalla cambiará a **"🟢 CONEXIÓN ACTIVA 24/7"**.

---

## 🎯 ¿Qué pasa si Hugging Face se reinicia o se actualiza?
**Absolutamente nada.** Como configuramos la persistencia en tu MongoDB Atlas, cada vez que el Space inicie, descargará tu sesión de WhatsApp automáticamente y se conectará en 3 segundos sin pedirte escanear el QR otra vez.

## 🧪 Pruebas inmediatas:
1. Desde tu número personal (**+53 52031972**), escribe al bot (**+53 63657247**):
   `"cambiar precio de pantalla Redmi Note 11 a 28"`
   *(La IA te confirmará el cambio al instante y modificará la base de datos).*
2. Desde otro teléfono, escribe preguntando precios o stock:
   `"¿Tienen pantalla para A51 y qué precio tiene?"`
   *(La IA responderá con el catálogo público y stock actual).*
