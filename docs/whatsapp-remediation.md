# Correcciones de la auditoría de IA y WhatsApp

Base revisada: `fbf5344`, incluyendo los cambios de modelos y sincronización del teléfono hechos después de la auditoría inicial. Se conservó Next.js 15, MongoDB, el catálogo y el POS existentes. No se utiliza un servicio externo de hosting para la conexión WhatsApp.

## Fase 1 — Accesos

| Hallazgo                                    | Corrección                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. `.env.local` versionado                  | Retirado del índice; archivo local y credencial MongoDB conservados. No se reescribe el historial anterior.                                                                                |
| 2. API de WhatsApp sin autenticación        | Comprobación en middleware y servidor; configuración, estadísticas, envío, archivo y restauración requieren sesión.                                                                        |
| 3. Cookie falsificable y claves en frontend | Login de servidor con comparación de tiempo constante, sesiones firmadas y registro revocable en MongoDB, cookie HttpOnly/Secure/SameSite. Toda la administración consulta la sesión real. |
| 4. Webhook suplantable                      | Firma HMAC del cuerpo con fecha para el puente; firma Meta y credencial Whapi separadas; proveedor seleccionado explícitamente.                                                            |
| 5. `/send` abierto y claves predeterminadas | Eliminados los endpoints locales de envío y desvinculación remota; interfaz en loopback, QR con formulario y cookie local, sin clave en URL ni CORS universal.                             |

Las variables nuevas de producción se configuraron mediante la sesión local autorizada de Vercel. Las claves privadas no se incluyen en este documento ni en el repositorio.

## Fase 2 — Integridad de negocio

| Hallazgo                                                  | Corrección                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7. Consultas, negaciones y listas ejecutadas como órdenes | Se eliminaron las escrituras directas por expresiones regulares. Las herramientas producen propuestas que requieren CONFIRMAR y código.                                                                                                       |
| 8. Contrato incompatible de órdenes                       | Esquema compartido con `productQuery`, `qty` y `precioOverride`; validación de campos y tipos antes de proponer.                                                                                                                              |
| 9. Operaciones a medias                                   | Ventas, ajustes, anulaciones y fusiones de IA se ejecutan en una transacción. Las mutaciones relacionadas del POS se envuelven para revertir también respuestas HTTP de error. Bloqueo transaccional compartido evita carreras de inventario. |
| 10. Stock negativo, cero perdido y lotes repetidos        | Descuento condicionado a existencias, enteros limitados, cero explícito, consolidación de entradas repetidas y rechazo de precios contradictorios. No se continúa silenciosamente tras un error parcial.                                      |
| 11. Variante equivocada y falsos duplicados               | Búsqueda por ID o coincidencia inequívoca; rechazo de ambigüedad. Detector excluye diferencias de calidad, marco y sufijos relevantes. Fusiones requieren equivalencia de alta confianza y usan IDs estables.                                 |
| 13. Texto libre como instrucción ejecutable               | Gemini utiliza llamadas a funciones con JSON Schema; el servidor valida y propone. La respuesta del modelo no ejecuta cambios por sí sola. El parser heredado también respeta cadenas JSON con llaves.                                        |

La confirmación guarda el resultado de la operación en la misma transacción. Dos confirmaciones simultáneas no deben crear dos ventas. Si cambió precio, calidad, visibilidad o tasa desde la propuesta, se pide una nueva. El stock se vuelve a validar dentro de la transacción.

Las fusiones conservan los datos comerciales históricos de las ventas; se migra la referencia del producto sin reescribir el nombre vendido. Un stock secundario de cero no inventa una entrada de una unidad.

## Fase 3 — IA y continuidad

| Hallazgo                                        | Corrección                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6. Modelos retirados y configuración divergente | Cliente Gemini común para web y WhatsApp; hasta dos modelos configurables, claves en cabecera, presupuesto global, cuota por conversación y tiempos máximos. Se retiraron los fallback de generaciones antiguas.                                         |
| 12. Pérdidas y duplicados                       | Entrada persistente, identificador único por proveedor/teléfono/mensaje, leases, cola por conversación y cinco intentos con estado de fallo. El puente conserva entradas en disco hasta que la nube confirma su recepción.                               |
| 15. Memoria y conversión frágiles               | Contexto persistente por conversación y últimas ocho intervenciones. La conversión usa producto e importe estructurados y vuelve a consultar el precio; no extrae el primer símbolo dólar del texto anterior.                                            |
| 18. Sesión, reconexión e infraestructura        | Archivos locales compatibles con la sesión existente, escritura atómica por clave, eliminaciones sincronizadas en disco y reconexión progresiva. Errores fatales detienen el proceso. Sondeo adaptativo; sin puerto público, túnel ni hosting adicional. |

La selección de catálogo se limita a candidatos clasificados en la base de datos antes de truncar. No se envía todo el histórico de ventas a Google en cada mensaje. Los detalles comerciales se configuran mediante datos aprobados, no por suposiciones del prompt.

## Fase 4 — Panel, métricas y atención

| Hallazgo                                            | Corrección                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14. Cifras financieras distintas o infladas         | Contexto de ventas excluye anuladas/devueltas, descuenta devoluciones parciales y separa moneda, ventas netas, cobros y deuda. Incluye hoy, ayer, últimos siete días, mes e histórico.                                                      |
| 16. Oculto mezclado con agotado y promesas técnicas | Los flujos corregidos de venta/reposición conservan visibilidad explícita. Alta con cero permanece reconocible como agotada. No se asume ORIGINAL C/M sin datos ni compatibilidad total por un nombre parecido.                             |
| 17. Estado verde y métricas engañosas               | Heartbeat de PC/WhatsApp con caducidad; fallo de carga explícito, última actualización y zona Cuba. Métricas completas por agregación, paginación/búsqueda en servidor, acciones confirmadas separadas de consultas, tokens y fallos de IA. |

El panel tiene cola y estados de envío, pausa/reactivación por conversación, historial de respuestas del equipo, exportación CSV neutralizada, archivo reversible y recuperación de registros durante 30 días. Se eliminó el fallback de envío directo desde el navegador al localhost con un secreto incrustado.

Los enlaces públicos del catálogo consultan el teléfono vinculado del bot; no mantienen un teléfono distinto codificado en cada componente.

## Pruebas

La revisión adicional de dependencias actualizó Next.js a 15.5.28 y corrigió dependencias transitivas de PostCSS y su parser sin migrar a Tailwind 4. Se utiliza la distribución oficial de SheetJS 0.20.3 para lectura; la biblioteca de estilos se conserva solo para generar exportaciones. Ambos módulos se cargan bajo demanda. La auditoría de dependencias terminó sin vulnerabilidades conocidas. El JavaScript inicial de `/admin` bajó aproximadamente de 445 kB a 128 kB según las compilaciones locales.

La compilación de producción y las 22 pruebas unitarias/regresión pasaron. También se comprobaron por HTTP el rechazo de cookies falsas, webhooks sin firma y cambios desde otro origen, el acceso autenticado a configuración/estadísticas y la revocación efectiva tras cerrar sesión. No se enviaron mensajes a clientes para estas comprobaciones.

La misma comprobación HTTP pasó en producción, junto con una consulta real a Gemini que devolvió la tasa vigente del negocio. Se reinició únicamente el puente anterior verificado de El Arca: recuperó la vinculación existente y quedó escuchando en `127.0.0.1:7860`, con conexión WhatsApp activa. Se conservaron las alertas sonoras y de escritorio y se evita dispararlas por abrir registros antiguos o archivarlos.

Limitación de observabilidad de esta revisión: el conector de registros de Vercel devolvió 403; la alternativa CLI no emitió muestras durante una ventana de 25 segundos. Eso no demuestra ausencia de errores históricos. La evidencia positiva corresponde a la compilación, pruebas, respuestas HTTP, consulta Gemini y conexión del puente.

La suite cubre firma y caducidad de sesiones, cookies falsificadas, CSRF, firmas de puente/Meta, esquemas, stock cero, cantidades inválidas, contrato de órdenes, variantes, parser JSON, búsqueda ambigua, ajuste negativo y cliente Gemini. Se actualizaron las pruebas anteriores que daban por válida una cookie literal `authenticated`.

La prueba de integración crea y elimina una base aislada y comprueba:

1. Reversión real de una orden tras un descuento parcial fallido.
2. Confirmación concurrente que vende y descuenta una sola vez.
3. Anulación concurrente que devuelve unidades una sola vez.
4. Confirmación vinculada al actor correcto.
5. Alta con stock cero.
6. Lote repetido consolidado en un producto y cinco unidades.
7. Respuesta HTTP de error que revierte escrituras.

## Restauración visual del panel WhatsApp

Se recuperó el diseño de `fbf5344`: cabecera, tarjetas oscuras, detalles dorados, pestañas de historial/administradores/bloqueados, buscador, filtros, tabla y diálogo de conversación. La sesión del servidor, los roles verificados, la cola con identificadores estables, el archivado recuperable y las alertas conservan las correcciones de la auditoría. La paginación y recuperación aparecen debajo de la tabla; los estados de envío y atención humana se agrupan en una sección desplegable con el mismo estilo. Los registros del panel web no ofrecen enlaces a números de WhatsApp inexistentes.

Se comprobó visualmente el panel y la pestaña de administradores, y el filtro de clientes devolvió únicamente sus conversaciones. No se enviaron mensajes ni se modificaron permisos o registros durante esta comprobación.

## Revisión de voz, recuperación de envíos y filtros

- Se incorporó un almacén local persistente para `getMessage` de Baileys. Permite recuperar el contenido de un envío ante una solicitud de reintento de cifrado; antes esa función no estaba configurada. No se borró ni reinició la vinculación del teléfono. Los eventos internos y las reacciones ya no disparan consultas a Gemini.
- Las notas de voz del puente local se descargan con límite de 2 MB/tres minutos, se validan, se transcriben con Gemini y pasan por la misma búsqueda, permisos, presupuesto y propuestas de operaciones. La respuesta sigue siendo texto. Confirmar o cancelar una operación exige el código escrito. No se guarda base64 en el historial de conversaciones.
- El QR local recupera el estilo oscuro/dorado, centra el acceso, muestra los errores en el formulario y no interrumpe la escritura con recargas. La clave elegida por el propietario se configura solo en el archivo privado.
- El filtro conserva la altura del historial, permite desplazarse dentro de la tabla y hace una transición de opacidad. Las peticiones anteriores se cancelan para que no sustituyan los resultados del filtro nuevo.
- Administradores y bloqueados se guardan con transacción y registro de auditoría. Los formularios conservan el número si falla el guardado y evitan solicitudes duplicadas simultáneas. Las pruebas de integración usan las rutas reales con sesión firmada y una base temporal aislada.
- Los contadores de pendientes y atención humana consultan el total, aunque la lista detalle muestre solo 30 envíos recientes y hasta 100 conversaciones pausadas.

### Qué significan los controles al final del historial

**Pendientes** son mensajes en cola o en envío aún no confirmados por el puente. **En atención** son conversaciones con respuestas automáticas pausadas para permitir atención humana; no significa que un empleado ya haya respondido. **Última señal** indica cuándo se comunicó la PC; **Datos** indica cuándo se generó la consulta del panel. **Tokens** contabiliza consumo de IA registrado, no cantidad de mensajes ni importe cobrado. **Errores** cuenta fallos registrados; cero no prueba que nunca haya ocurrido una incidencia externa. **Enviado** indica aceptación por WhatsApp, sin garantizar lectura.

**Recuperar registros archivados** devuelve al historial los registros ocultados con la papelera durante los últimos 30 días. Solo recupera el registro del panel: no restaura chats borrados de WhatsApp, no reenvía mensajes y no revierte ventas o cambios de stock.

## Límites operativos explícitos

- La PC y WhatsApp deben permanecer disponibles. El panel marca desconexión tras 60 segundos sin señal; la cola conserva pendientes hasta siete días.
- Google puede rechazar modelos o agotar cuota. La conexión WhatsApp y la disponibilidad de IA son estados distintos.
- No se envían mensajes reales a clientes como parte de las pruebas automatizadas. El envío físico depende de la sesión vinculada del teléfono.
- No existe una garantía universal de entrega exactamente una vez ante una caída entre el servidor de WhatsApp y la escritura del comprobante local. El puente usa IDs estables y progreso persistente; las operaciones de negocio sí tienen idempotencia transaccional.
- La retención automática depende de los índices TTL de MongoDB y no ocurre al segundo exacto.
- Meta requiere sus propias credenciales y una versión Graph vigente configurada; el modo local no las utiliza. Un envío Meta fuera de la ventana de atención exige una plantilla aprobada y no se intenta como texto libre.
- El catálogo histórico puede contener registros ocultos por versiones anteriores. No se cambió masivamente su visibilidad porque también puede haber ocultaciones deliberadas; se revisan desde inventario/ocultos.
- La equivalencia eléctrica y física de un repuesto no puede garantizarse solo con similitud de texto. Las fusiones se restringen y requieren revisión humana.
