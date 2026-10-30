# POS: orden responsive y comprobante por WhatsApp — 30/10/2026

## Diseño y uso

- Cliente/taller a la izquierda y WhatsApp a la derecha, con campos opcionales y etiquetas alineadas incluso a 320 px. Un número local de 8 dígitos se interpreta como cubano (+53); también se admiten números internacionales explícitos.
- Moneda y estado de pago juntos. La moneda seleccionada determina el total principal. El equivalente se muestra en una segunda línea amplia, con la tasa aplicada visible.
- Impresora y copias en un mismo bloque compacto. Bluetooth, USB/Serial y Sistema usan SVG con nombre accesible, selección indicada y descripción del modo activo.
- Observaciones debajo de impresión/copias. Se aclara que estas observaciones se imprimen en el ticket y no se envían por WhatsApp.
- Venta registrada identificada por su orden, con reimpresión del documento guardado y botón de envío digital independiente. Un fallo de WhatsApp no vuelve a cobrar ni descontar stock.
- Acceso al comprobante desde los detalles de cualquier venta del historial. El historial también permite buscar por el teléfono guardado.
- Catálogo del POS conservado visible durante la actualización posterior a la venta. Controles del carrito y datos del cobro bloqueados mientras se registra, con identificador de intento reutilizable ante errores de conexión.
- Inventario: buscador y botones Todos/Disponibles/Agotados alineados y con altura de 44 px; los atajos quedan fuera de la fila horizontal.

## Flujo del comprobante

1. Completar opcionalmente cliente y WhatsApp; registrar la venta, con o sin impresión.
2. En la orden registrada, verificar el destinatario y abrir la vista previa del comprobante.
3. Pulsar **Enviar comprobante por WhatsApp**. La API autentica al administrador, consulta la venta guardada y coloca un mensaje en la cola del bot.
4. El puente WhatsApp de la PC consulta esa cola y envía el mensaje desde la cuenta del negocio. La pantalla distingue En cola, Enviando, Esperando confirmación, Enviado, Entregado y Leído según los estados disponibles.

El comprobante es un resumen formal de texto: negocio, número de orden, fecha de La Habana, cliente, productos/cantidades/precios, importes y tasa originales y estado de pago. Las devoluciones y anulaciones se identifican expresamente. Las listas de compatibilidad muy largas se abrevian con puntos suspensivos para mantener el mensaje dentro del tamaño admitido. No se incluyen observaciones del ticket ni se aceptan importes o texto suministrados por el cliente HTTP.

Puede solicitarse desde otra PC o desde un teléfono con sesión administrativa: el envío pasa por Vercel y la cola central. La PC que ejecuta el bot debe estar encendida, conectada y con WhatsApp vinculado. Si está desconectada, la solicitud permanece en cola un máximo de 7 días; no se muestra como enviada. Los controles Bluetooth/USB de impresión siguen dependiendo del equipo, navegador y conexión de impresora locales.

## Consistencia y privacidad

- `Sale.clientPhone` es opcional y compatible con ventas antiguas. El teléfono no se publica en el catálogo.
- `/api/sales/receipt` GET/POST exige sesión administrativa; POST exige mismo origen y limita envíos. GET solo consulta: nunca encola un mensaje.
- Identificador determinista por venta, teléfono y contenido: solicitudes simultáneas o repetidas reutilizan el mismo envío. El registro de auditoría evita recrear un mensaje ya enviado cuando su cola de transporte ha caducado, durante los 90 días de retención de ese registro.
- Destinatario validado y normalizado en el servidor. La API no usa teléfonos como JID proporcionados por el navegador.
- Cola, teléfono guardado y auditoría se actualizan en transacción. El envío externo sucede después a través del puente existente.
- Un fallo con referencia nativa de WhatsApp exige revisar la conversación antes de reintentar; no se repite a ciegas un envío ambiguo. Ningún reintento del comprobante crea otra venta.
- Se conservan las protecciones existentes contra doble venta, descuentos duplicados de stock y cambios de tasa.

## Verificación

- 90 pruebas unitarias aprobadas: teléfono, formato del comprobante, importes históricos, privacidad de notas, devoluciones/anulaciones y orden/jerarquía del formulario; también las regresiones previas de inventario y buscador.
- Integración real con una base temporal y cola aisladas: venta con teléfono, vista previa sin envío, dos POST simultáneos con un solo mensaje, stock descontado una sola vez, datos HTTP falsificados ignorados, reintento seguro, estados de entrega, deduplicación tras caducar la cola y protección de sesión/origen. La base temporal se elimina al terminar.
- Revisión local del POS a 320, 390, 556, 950 y 1280 px: campos alineados, sin desbordamiento horizontal y total principal coherente al alternar USD/CUP. Consola sin errores.
- No se registraron ventas comerciales ni se enviaron mensajes a clientes reales para la prueba. Las confirmaciones de entrega se simularon únicamente en la cola temporal. No se probó una impresión física.

[Vista previa de la orden en CUP](qa-pos-orden-2026-10-30.png).
