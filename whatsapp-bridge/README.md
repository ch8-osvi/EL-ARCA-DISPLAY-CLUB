# WhatsApp en la PC del negocio

La conexión activa se ejecuta en esta PC. Vercel recibe eventos, ejecuta la IA y conserva las colas en MongoDB. No se abre ningún puerto público del ordenador.

## Iniciar

Desde la raíz del proyecto:

```powershell
npm ci
npm --prefix whatsapp-bridge ci
npm run bot:start
```

Abre http://127.0.0.1:7860/scan en esta misma PC. Introduce SCAN_ACCESS_KEY del archivo local privado y escanea el QR si WhatsApp lo solicita. El panel de producción solo puede abrir el QR en la máquina desde la que navegas.

La configuración privada vive en whatsapp-bridge/.env. BRIDGE_SECRET debe coincidir con WHATSAPP_BRIDGE_SECRET en Vercel. La sesión existente auth_session es compatible; no se borra ni se restaura desde copias antiguas en MongoDB.

## Persistencia y recuperación

- auth_session conserva credenciales y claves mediante escritura atómica y bloqueo por archivo.
- spool conserva entradas pendientes y el progreso de envíos por fragmentos. No borres estas carpetas durante una reconexión.
- message-cache conserva durante siete días el contenido original de los envíos para que `getMessage` de Baileys pueda reenviarlo si otro dispositivo no lo descifra. Se escribe antes de enviar y se limpia al iniciar y cada hora. No se sube a Git. Esto corrige la ausencia del mecanismo de recuperación; no permite prometer que WhatsApp nunca mostrará un aviso temporal de cifrado.
- Al reiniciar, el puente reenvía las entradas pendientes. La nube identifica cada mensaje y cada operación para no duplicar ventas.
- La cola de salida se consulta por HTTPS, con firma HMAC y fecha. No existe un endpoint público /send ni CORS universal.
- Los reintentos de confirmaciones recuperan el resultado previamente confirmado. Una entrega de WhatsApp no puede garantizar exactamente una copia ante cualquier caída entre proveedor y disco; se conserva progreso y se usan IDs estables para reducir ese caso.
- Las reconexiones usan espera progresiva y un solo socket. Un fallo fatal detiene el proceso para evitar continuar en estado corrupto.
- Los cierres anormales de WebSocket (`1006`) y los errores de red identificados en Baileys solicitan una reconexión, sin cerrar el servidor local del QR. Los avisos repetidos comparten un solo temporizador; conectar o apagar cancela el reintento. Un cierre de sesión explícito no se reintenta. La consulta de versión tiene un límite de diez segundos para no bloquear el arranque cuando falla Internet.
- Si el teléfono cierra la sesión, el puente lo indica en la consola. Conserva una copia de auth_session antes de retirarla manualmente para volver a vincular.

## Disponibilidad y consumo

La PC debe permanecer encendida, conectada a Internet y sin suspensión. La nube conserva mensajes pendientes hasta 7 días; los mensajes antiguos no se ejecutan después de caducar. Las entradas nuevas despiertan el trabajador inmediatamente; el sondeo de reposo tiene un máximo de tres segundos. No se promete disponibilidad permanente gratuita de un proveedor externo.

El panel muestra la última señal; tras 60 segundos sin heartbeat informa desconexión. Enviado significa aceptado por WhatsApp, no leído por el destinatario. Se descargan notas de voz de hasta 2 MB y tres minutos, se envían firmadas al servidor y Gemini las transcribe antes de consultar el catálogo y preparar una respuesta escrita. No hay respuesta de voz ni OCR de fotografías. Los audios incomprensibles o demasiado largos solicitan aclaración. El audio temporal se elimina de la entrada al completar el procesamiento; si queda pendiente caduca con la entrada a los siete días. El historial guarda la transcripción y suma el consumo de transcripción y respuesta. Los bloqueados y conversaciones pausadas no consumen Gemini por audio.

El formulario QR usa la clave privada `SCAN_ACCESS_KEY` (8 caracteres como mínimo), protección de intentos y una cookie local de una hora. No se recarga mientras escribes. Solo el panel ya autenticado se actualiza automáticamente. La contraseña nunca se incluye en enlaces ni en el código publicado.

## Comandos seguros

Pide una operación normalmente. Revisa producto, variante, cantidad, precio, moneda y estado de pago en la propuesta. Escribe CONFIRMAR seguido del código de ocho caracteres. Caduca a los diez minutos y se liga a la conversación que la solicitó. CANCELAR seguido del código la descarta. Una lista de precios no da de alta productos; para proponer un lote usa Agregar lote: y una línea por artículo con calidad y marco explícitos.

Las consultas no necesitan confirmación. Un cliente puede escribir HUMANO para pausar las respuestas automáticas; el equipo reactiva el bot desde el panel.

Consulta también ../README.md y ../docs/whatsapp-remediation.md.
