# El Arca Display Club

Catálogo, inventario, ventas y asistente de WhatsApp. La aplicación funciona en Vercel; el puente WhatsApp se ejecuta en la PC del negocio y consulta una cola segura en la nube. No requiere publicar puertos de la PC.

**Categorías planas (28/10/2026):** [Pantallas, Baterías, Repuestos y Accesorios y herramientas](docs/README-categorias-planas-2026-10-28.md), sin subcategorías y con un solo icono por categoría.

**Auditoría del 28/10/2026:** [Informe integral: badges, ventas, devoluciones, IA y recuperación](docs/README-auditoria-integral-2026-10-28.md). Incluye los fallos corregidos, 53 pruebas unitarias, integración en bases temporales y límites de la entrega.

**Entrega del 27/10/2026:** [Informe de mejoras, multicategoría, IA de clientes y verificación](docs/README-mejoras-2026-10-27.md). Incluye el plan ejecutado, errores corregidos y cómo revisar cada cambio.

## Empezar

```powershell
npm ci
npm --prefix whatsapp-bridge ci
npm run dev
# En otra terminal:
npm run bot:start
```

La configuración privada se conserva en `.env.local` y `whatsapp-bridge/.env`. Consulta `.env.example` para los nombres de las variables. Nunca se deben subir esos archivos, `auth_session` o `spool` a Git.

En esta instalación, las nuevas claves del panel y del QR se guardaron en **`.admin-access.local.txt`**, archivo privado excluido de Git. El acceso al panel es único para todas las secciones; las antiguas contraseñas embebidas en JavaScript ya no son válidas. Las sesiones duran ocho horas y se revocan al cerrar sesión.

La credencial de MongoDB se conserva por decisión del propietario. `.env.local` deja de estar versionado; las versiones históricas previas no se reescriben.

## WhatsApp en la PC

1. Ejecuta `npm run bot:start`.
2. Abre **http://127.0.0.1:7860/scan** en esa PC e introduce la clave local del QR.
3. Vincula el teléfono si aparece un QR. La sesión existente se conserva.
4. Abre **https://elarca-displayclub.vercel.app/admin/whatsapp** e inicia sesión en `/admin` si se solicita.
5. Comprueba la última señal de conexión y la cola de envíos.

La PC debe estar encendida, con Internet y sin suspensión. Un estado verde indica una señal reciente de la conexión WhatsApp; no demuestra que Google tenga cuota disponible. El panel distingue errores de IA, tokens y estados de envío.

## Operaciones con confirmación

Puedes consultar precios, stock, inventario o ventas sin confirmación. Para cambiar datos, el asistente prepara una propuesta con producto, variante, cantidades, precios, moneda y estado de pago. **Todavía no modifica datos**.

```text
Cambiar el precio del producto [ID] a 15,50 USD
# El bot devuelve la propuesta y un código.
CONFIRMAR A1B2C3D4
# O bien:
CANCELAR A1B2C3D4
```

El código dura diez minutos, se vincula al teléfono o conversación que lo solicitó y solo se ejecuta una vez. Repetir una confirmación recupera el resultado guardado. Si cambió el precio, la variante o la tasa desde la propuesta, se exige una propuesta nueva. La disponibilidad se vuelve a comprobar al ejecutar.

Para proponer una entrada de mercancía:

```text
Agregar lote:
SAMSUNG A12 INCELL C/M x2 - $15.50
XIAOMI REDMI 9A ORIGINAL S/M x3 - $12
```

Una cotización o lista pegada sin esa intención no se ejecuta directamente. Debes indicar calidad y marco; el sistema ya no inventa ORIGINAL C/M cuando faltan. Las búsquedas ambiguas piden el ID o variante exacta. Las fusiones bloquean diferencias de calidad, marco y variantes detectadas; la equivalencia técnica debe revisarse.

## Atención humana y seguimiento

- El cliente puede escribir `HUMANO` para pausar el bot. El equipo lo reactiva desde Atención humana o el detalle de una conversación.
- Las respuestas del equipo se guardan en una cola. **En cola** no significa enviado. **Enviado a WhatsApp** no significa leído.
- La búsqueda y la paginación consultan todo el historial retenido. El CSV exporta la página actual, con neutralización de fórmulas.
- Archivar registros permite recuperarlos durante 30 días desde el panel. Los registros normales se retienen 90 días por defecto; `BOT_LOG_RETENTION_DAYS` permite ajustar entre 30 y 365.
- La cola caduca a los siete días; nunca se deben ejecutar mensajes viejos tras esa fecha.
- El puente local comprende notas de voz con Gemini (máximo 2 MB y tres minutos) y responde por texto. Las confirmaciones de operaciones siguen exigiendo el código escrito. Las imágenes todavía requieren una descripción escrita.

## Configuración

| Variable                 | Uso                                                                        |
| ------------------------ | -------------------------------------------------------------------------- |
| `MONGODB_URI`            | Base del negocio; mantenida sin rotación                                   |
| `ADMIN_PASSWORD`         | Contraseña administrativa de al menos 8 caracteres                         |
| `ADMIN_SESSION_SECRET`   | Firma de sesiones; al menos 32 caracteres aleatorios                       |
| `ADMIN_PHONE_NUMBER`     | Teléfono completo del propietario; comparación exacta                      |
| `WHATSAPP_BRIDGE_SECRET` | Firma de las peticiones de la PC a Vercel                                  |
| `BRIDGE_SECRET`          | Mismo secreto, en `whatsapp-bridge/.env`                                   |
| `SCAN_ACCESS_KEY`        | Clave privada del QR local, al menos 8 caracteres; nunca se publica en Git |
| `WHATSAPP_PROVIDER`      | `bridge` para esta instalación                                             |
| `GEMINI_API_KEY`         | Credencial de Google, solo en servidor                                     |
| `GEMINI_MODELS`          | Lista de hasta dos modelos para fallback controlado                        |
| `BOT_DAILY_TOKEN_LIMIT`  | Tope de tokens en las últimas 24 horas; predeterminado 200000              |
| `BOT_BUSINESS_INFO`      | Dirección, horario, pagos, garantía e información comercial verificada     |

Si no se configura información comercial, el bot pide confirmar esos detalles con una persona. No promete instalación, pagos, envío ni garantía inventados. Los modelos se validan contra la disponibilidad real de Google; las cuotas y costes dependen de la cuenta.

Meta y Whapi se mantienen como proveedores alternativos explícitos, con autenticación independiente y sin cambiar automáticamente de cuenta. Meta requiere firma de webhook, versión Graph configurada y ventana válida de atención; fuera de ella debe utilizarse una plantilla aprobada. Esta instalación utiliza Baileys local.

## Comprobaciones

Últimos ajustes: [Buscador y tarjetas — 28/10/2026](docs/README-buscador-tarjetas-2026-10-28.md).

```powershell
npm test
npm run typecheck
npm run build
node --check whatsapp-bridge/server.js
node scripts/verify-bot-integration.cjs
```

La última prueba crea una base nueva `codex_bot_verification_<aleatorio>`, prueba transacciones reales y elimina únicamente esa base temporal. Nunca usa el nombre de la base del negocio. Si el resolvedor local bloquea consultas SRV, puede ejecutarse con `MONGODB_DNS_SERVERS` configurado solo para ese proceso.

El detalle de las correcciones y la matriz de auditoría están en [docs/whatsapp-remediation.md](docs/whatsapp-remediation.md). La operación del puente está en [whatsapp-bridge/README.md](whatsapp-bridge/README.md).

## Organización del código

- `src/lib/security`: sesiones, revocación, firmas, límites y transacciones HTTP.
- `src/lib/ai/contracts.ts`: contrato único de herramientas y validación en servidor.
- `src/lib/ai/operations.ts`: propuestas, confirmación, transacciones, idempotencia y auditoría.
- `src/lib/ai/gemini.ts`: cliente Gemini, tiempos máximos y errores de proveedor.
- `src/lib/whatsapp`: identidad, conversación, bandeja de entrada, cola de salida y proveedores.
- `src/lib/models/BotState.ts`: estados persistentes del bot; no se confía en memoria de una instancia de Vercel.
- `whatsapp-bridge`: sesión local, firma HTTPS, spool y reconexión.
- `scripts/tests`: pruebas unitarias y de regresión; `scripts/verify-bot-integration.cjs`: integración real aislada.
