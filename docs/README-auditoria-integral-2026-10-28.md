# Auditoría integral y correcciones · 28 de octubre de 2026

Se revisaron catálogo público, badges, precios, administración, inventario, ventas, devoluciones, herramientas administrativas de IA, transporte de WhatsApp, sesiones, límites de peticiones y analítica. Se mantuvo el diseño oscuro/dorado aprobado, con sus precios horizontales y la navbar compacta.

## Lo más importante

1. Los badges públicos ahora tienen reglas compartidas y el ranking descuenta devoluciones.
2. El POS y el servidor guardan el mismo total CUP redondeado. Las devoluciones completas recuperan exactamente el importe original.
3. Los reintentos identificados de ventas y devoluciones recuperan su resultado, sin volver a descontar o reponer stock.
4. Los resúmenes diarios incluyen todas las órdenes de hoy; el límite de 200 filas del historial ya no recorta esos totales ni el contador histórico.
5. El catálogo y el contacto de WhatsApp se recuperan y actualizan automáticamente en una pestaña abierta.

## Hallazgos y soluciones

| Prioridad | Fallo encontrado                                                                                                      | Corrección                                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta      | El POS mostraba un total CUP redondeado, pero la API guardaba la multiplicación sin redondear                         | POS, API y herramientas de venta IA usan la misma regla: total USD convertido y redondeado al centenar de CUP                                                                                                     |
| Alta      | Devolver por multiplicación de la tasa podía dejar un residuo frente al importe cobrado                               | Se distribuye el total original de la venta, con ajuste del residuo en la devolución final; también se respeta el importe de ventas antiguas                                                                      |
| Alta      | Reintentar una venta tras perder la respuesta podía registrarla otra vez                                              | El POS añade un identificador estable para repetir el mismo intento; la venta guarda su huella e identificador único. Un reintento idéntico recupera el resultado; reutilizar la clave con otros datos se rechaza |
| Alta      | Una devolución parcial repetida podía volver a reponer unidades                                                       | El formulario y la API aplican la misma protección de reintentos a cada lote de devolución                                                                                                                        |
| Alta      | El resumen diario dependía de las últimas 200 ventas                                                                  | Agregación independiente de todas las órdenes del día en `America/Havana`; el listado sigue limitado para no cargar un historial enorme                                                                           |
| Alta      | Devolver una venta pendiente podía aparentar una salida de caja sin cobro previo                                      | Las devoluciones de órdenes pendientes reducen la deuda restante; no se restan de los cobros de órdenes pagadas                                                                                                   |
| Alta      | El contador «Total histórico» usaba el tamaño del listado limitado                                                    | La API cuenta realmente las ventas; la interfaz avisa cuando muestra solo las 200 más recientes                                                                                                                   |
| Alta      | Peticiones mal formadas podían usar IDs como objetos, booleanos como cantidades o destinos de devolución mal escritos | Validación de identificadores, cantidades, moneda, pago booleano, tamaño de listas, texto y destinos antes de alterar stock                                                                                       |
| Media     | La IA podía crear dos líneas del mismo producto y complicar su devolución                                             | Se agrupan las cantidades de un SKU cuando tienen el mismo precio; precios contradictorios requieren aclaración. Subtotales y totales USD se normalizan a centavos                                                |
| Media     | «Más vendido» sumaba unidades posteriormente devueltas                                                                | Se cuentan unidades netas. Se excluyen órdenes anuladas/devueltas y productos ocultos o agotados antes de seleccionar las 15 posiciones                                                                           |
| Media     | Productos ocultos o retirados podían ocupar las posiciones del ranking público                                        | El ranking cruza la disponibilidad actual del producto antes de limitar resultados; los empates tienen orden estable                                                                                              |
| Media     | «Nuevo ingreso» aceptaba fechas futuras                                                                               | Fecha válida, no futura, con antigüedad menor de 14 días. Los agotados no reciben distintivos promocionales                                                                                                       |
| Media     | La condición de stock bajo difería entre catálogo e IA                                                                | Un criterio público compartido: una o dos unidades. No se muestran cantidades exactas al cliente                                                                                                                  |
| Media     | Cuadrícula y lista duplicaban reglas de badges                                                                        | Ambas usan `getProductBadges`; `/admin` continúa sin esos distintivos                                                                                                                                             |
| Media     | Una pestaña abierta podía conservar durante horas un stock o badge antiguo                                            | Revalidación silenciosa cada minuto mientras es visible, al recuperar conexión y al volver a la pestaña; sin reiniciar skeleton ni filtros                                                                        |
| Media     | La primera consulta fallida del teléfono dejaba el contacto vacío durante toda la sesión                              | Almacén compartido, consulta deduplicada, recuperación automática y tiempo de espera. Cien consumidores no generan cien consultas                                                                                 |
| Media     | Dos consultas de tasa podían resolverse fuera de orden                                                                | Solo se aplica la respuesta más reciente del hook. Se elimina además la consulta duplicada del catálogo                                                                                                           |
| Media     | La analítica aceptaba datos sin límites y calculaba «hoy» en la zona del servidor                                     | Límites de tamaño y frecuencia, origen permitido, fecha de Cuba y registro de sesión solo tras respuesta correcta                                                                                                 |
| Media     | El resumen filtrado del historial y algunos mensajes de cobro ignoraban devoluciones                                  | Se muestran importes netos y deudas restantes; los mensajes administrativos de pago no presentan como deuda lo ya devuelto                                                                                        |
| Baja      | Los IDs de productos nuevos dependían del milisegundo                                                                 | UUID para evitar colisiones entre altas muy próximas                                                                                                                                                              |
| Baja      | Lecturas recientes carecían de índice de fecha                                                                        | Índices `createdAt` en ventas y visitas; orden estable de historial                                                                                                                                               |
| Baja      | La vista de lista seguía titulando la columna «Modelo Display»                                                        | «Modelo / Repuesto», coherente con el catálogo multicategoría                                                                                                                                                     |

## Regla exacta de los badges públicos

- **Más vendido:** una de las 15 referencias disponibles con más unidades netas vendidas. Unidades netas = unidades de órdenes no anuladas menos unidades devueltas. No es una clasificación por ingresos ni exclusivamente del día.
- **Bajo stock:** stock entero de 1 o 2 unidades.
- **Nuevo ingreso / Nuevo:** producto creado hace menos de 14 días, con fecha válida y no futura.
- Un agotado no recibe estos distintivos. Se conservan marca, categoría y calidad como datos independientes.
- En `/admin` no se restauraron los badges promocionales retirados por petición del usuario.

## Importes, devoluciones y compatibilidad

El texto del botón de WhatsApp y el contacto del pie de página también pasan a usar el mismo número configurado que su enlace. Antes mostraban un número fijo que podía diferir del destino real del bot.

El redondeo CUP se aplica al **total de la orden**, como ya mostraba el POS. No se suman los redondeos individuales de cada tarjeta para facturar: el catálogo informa precios orientativos por unidad y la orden determina el total.

Las ventas existentes conservan sus importes. Para una devolución se usan los totales guardados de esa venta, no la tasa actual. Las devoluciones parciales distribuyen el importe y la última recoge el residuo, evitando perder centavos o pesos. Si el producto fue eliminado del inventario, se conserva el comportamiento anterior de registrar las unidades fuera del inventario sin recrearlo.

Ejemplos comprobados:

- Venta de 1 USD a tasa 835: POS y registro guardan 800 CUP por el redondeo al centenar.
- Una línea de tres unidades cuyo subtotal es 1 USD: devoluciones USD de 0,33 + 0,34 + 0,33, que suman exactamente 1 USD.
- Para esa venta de 800 CUP: devoluciones de 264 + 272 + 264 CUP, que suman exactamente lo cobrado.
- Dos POST simultáneos con el mismo identificador: una venta y un único descuento de stock.

Los identificadores de reintento son opcionales en la API por retrocompatibilidad. El POS y formulario actualizados los envían y los conservan al repetir el mismo intento en la pestaña. No sustituyen revisar el historial si se recarga la página, se cambia el contenido de la operación o se utiliza un cliente antiguo sin esa clave.

## Pruebas realizadas

- **53 pruebas unitarias correctas:** las 46 anteriores y siete nuevas de badges, contacto, huellas de reintento y reparto de devoluciones.
- Integración real en bases MongoDB temporales con nombres exclusivos, eliminadas al terminar. Se prueban rollback, confirmación concurrente de IA, ventas, anulación, categorías, importación, permisos y bloqueados, borrado definitivo con historial, recuperación de reintentos, ranking y analítica.
- Nuevos casos: más de 200 órdenes en un día; deuda pendiente tras devolución; SKU repetido en orden IA; producto oculto/agotado fuera del ranking; ventas anuladas y unidades devueltas; venta y devolución repetidas; claves reutilizadas con otros datos; total CUP y residuo de devolución; dos POST concurrentes.
- Comprobación de tipos y compilación de producción.
- Navegador con datos ficticios: badges por fecha y stock, ausencia de badges promocionales en administración, móvil a 390 px sin desbordamiento y vista previa de devolución parcial/completa coincidente con la API. El formulario se canceló sin guardar.
- Se cambió solo un producto ficticio en la base temporal y se comprobó que el catálogo actualiza su stock al volver a la pestaña, sin repetir el skeleton.
- `npm audit` de la web, incluyendo desarrollo: **0 avisos**. Dependencias de producción del puente: **0 avisos**. No se instalaron actualizaciones masivas.
- Puente local conectado al revisarlo. Permanecen las pruebas anteriores de audio, cifrado recuperable, formato de negritas, enrutamiento del chat y reconexión.
- Consulta de solo lectura al negocio: **0 ventas históricas con líneas duplicadas del mismo SKU**. No se recalcularon ventas históricas ni se ajustó inventario real.

## Archivos principales

- `src/lib/productBadges.ts`: reglas públicas de distintivos.
- `src/lib/contactStore.ts`, `useWhatsAppPhone.ts`: contacto compartido y recuperación.
- `src/app/page.tsx`, `useActiveExchangeRate.ts`: actualización y control de respuestas tardías.
- `src/lib/salesSummary.ts`: métricas diarias independientes del listado.
- `src/lib/refundAmounts.ts`: distribución de devoluciones desde los importes originales.
- `src/lib/security/request-fingerprint.ts`: comparación estable de reintentos.
- `src/app/api/sales/route.ts`, `products/route.ts`, `stock/route.ts`, `analytics/route.ts`: validación y correcciones de datos.
- `src/app/admin/pos/page.tsx`, `historial/page.tsx`: solicitudes identificadas, totales y vista previa.
- `src/lib/ai/adminTools.ts`, `src/lib/whatsapp/tools.ts`: órdenes consistentes y mensajes de importes netos.
- `scripts/tests/audit-regressions.test.cjs`, `scripts/verify-bot-integration.cjs`: nuevas regresiones automatizadas.

## Qué revisar al volver

1. Recargar el catálogo y comprobar los badges en cuadrícula y lista. Los de administración siguen ausentes.
2. En la siguiente venta habitual, comparar el total confirmado con el mostrado por el POS y el ticket.
3. En devoluciones, comprobar la vista previa y el total guardado; no es necesario crear ventas ficticias en el negocio para probarlo.
4. Consultar el historial: importes netos, contador histórico real y aviso cuando la lista alcanza su ventana de 200 registros.
5. Mantener la PC del bot encendida y conectada para que pueda recibir y enviar mensajes.

## Límites de esta entrega

- El historial visible sigue siendo una ventana de 200 ventas recientes; no es todavía una búsqueda paginada de todo el archivo. Los contadores históricos y los totales diarios no están limitados a esas 200 filas.
- «Ventas de hoy» agrupa órdenes creadas hoy en Cuba, con su estado y devoluciones actuales. No equivale a un libro contable de cobros y reembolsos por fecha efectiva del movimiento. Por eso se retiró la etiqueta de «Caja ... (Efectivo)».
- La IA se verificó con pruebas controladas y el puente mediante su estado local. No se enviaron mensajes a clientes ni se hizo una conversación real nueva para prometer la calidad de cualquier respuesta futura del modelo.
- Una auditoría con pruebas reduce fallos conocidos; no demuestra ausencia absoluta de errores en todos los dispositivos, caídas de proveedores o datos futuros. Se documentan los casos efectivamente comprobados.

No cambiaron la contraseña de acceso, las claves de MongoDB, el alojamiento local del bot ni el estilo visual aprobado. No se ejecutaron ventas, devoluciones ni envíos de prueba sobre datos reales del negocio.
