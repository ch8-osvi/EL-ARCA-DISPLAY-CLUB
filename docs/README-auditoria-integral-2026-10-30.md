# Auditoría integral y correcciones — 30 de octubre de 2026

Revisión iniciada el 29 y completada el 30 de octubre de 2026. Se conservaron los cambios de calidad y del bot realizados anteriormente. El alcance comprende catálogo público, administración, inventario, POS, historial, devoluciones, duplicados, etiquetas, IA, WhatsApp, autenticación, importaciones y organización del proyecto.

## Cambios corregidos

| Área          | Error comprobado                                                                                                                          | Corrección                                                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventario    | Una edición fallida cambiaba la tarjeta local y anunciaba «actualizado en modo local», aunque MongoDB no la hubiera guardado.             | Se muestra éxito únicamente tras confirmación del servidor. Si falla, se conservan los datos anteriores y el formulario para revisar el intento.                                                                                           |
| Inventario    | Editar un formulario antiguo podía sobrescribir stock actualizado por una venta posterior.                                                | El formulario envía `expectedUpdatedAt`; la API rechaza la versión antigua con HTTP 409. La integración comprueba que el stock más reciente permanece intacto.                                                                             |
| Inventario    | Un fallo HTTP al cargar stock podía parecer un inventario vacío válido.                                                                   | Se comprueba HTTP, `success` y la lista de productos; el fallo genera un aviso. Se añadieron guardas de envío mientras una operación está en curso.                                                                                        |
| Calidades     | Excel, respuestas API, etiquetas y algunos caminos de escritura todavía podían usar ORIGINAL S/M o INCELL S/M.                            | Una misma regla normaliza las lecturas del catálogo, las importaciones y el modelo de persistencia. Los borradores antiguos también se muestran con la calidad normalizada al imprimir. No se ejecutó una migración masiva del inventario. |
| Calidades     | El detector de duplicados consideraba INCELL e INCELL S/M como calidades distintas.                                                       | Usa la misma normalización. Se mantienen separadas las versiones con marco, Pro, Plus, 4G/5G y las especificaciones personalizadas.                                                                                                        |
| Excel         | Una referencia heredada podía duplicarse al importar la calidad ya normalizada.                                                           | La identidad se compara por categoría, marca, modelo y calidad normalizados. Los archivos con IDs mantienen cada referencia existente, sin fusionar cantidades.                                                                            |
| Excel         | Filas nulas, IDs inválidos o referencias ambiguas no tenían un tratamiento consistente.                                                   | Validación previa a las escrituras. Las coincidencias ambiguas requieren ID. Identidades serializadas evitan colisiones por separadores dentro de los nombres.                                                                             |
| IA            | La ejecución de las altas confirmadas descartaba `categoria`, aunque la propuesta la incluyera. Una batería podía terminar como pantalla. | Las altas individuales y los lotes transmiten la categoría al ejecutor. Se prueba con BATERIA y REPUESTO, incluyendo stock cero.                                                                                                           |
| IA            | Cambiar marca, modelo o calidad podía crear una identidad ya existente.                                                                   | Se comprueba la colisión antes de modificar y se devuelve un error para revisar las referencias. Los mensajes de calidad usan el valor que se guarda.                                                                                      |
| Fusiones      | Cambiar los IDs de líneas de ventas antiguas podía dejar dos líneas con el mismo ID e invalidar devoluciones.                             | Se rechaza la fusión si el secundario tiene ventas o devoluciones. No se reescriben sus referencias históricas. La limpieza automática también conserva estos casos.                                                                       |
| Fusiones      | Se podía mezclar stock oculto con stock público.                                                                                          | Se exige la misma visibilidad. Las cantidades apartadas no se incorporan automáticamente al catálogo público.                                                                                                                              |
| Duplicados    | La lista excluía agotados y permitía escribir una calidad final que la API ignoraba.                                                      | Se consultan todas las referencias activas, incluidas las agotadas. La calidad se presenta como conservada, sin ofrecer una edición que no se aplicaba.                                                                                    |
| Pagos         | Repetir una petición «alternar pagado» podía invertir de nuevo el estado.                                                                 | La interfaz envía el estado booleano deseado y usa la respuesta del servidor. Repetir `paid: true` mantiene la orden pagada; se bloquean clics mientras se procesa.                                                                        |
| API           | Una fusión mal formada podía lanzar un error sin controlar; descartar duplicados aceptaba IDs como objetos.                               | JSON e identificadores validados, con HTTP 400 antes de modificar datos. Se rechazan precios no finitos, fuera de rango o enviados como texto.                                                                                             |
| Sesiones      | La caída de MongoDB podía salir del verificador de sesión como excepción sin controlar.                                                   | Respuesta JSON HTTP 503, sin exponer los detalles de conexión. Los fallos al preparar la transacción también pasan por el tratamiento de errores.                                                                                          |
| Etiquetas     | Borradores locales con listas o instantáneas corruptas podían romper React; cantidades decimales se truncaban.                            | Validación de borradores, cantidades enteras y configuración. Se evita expandir lotes de más de 10.000 stickers en memoria y se pide dividirlos al imprimir.                                                                               |
| Accesibilidad | El historial carecía de un encabezado principal y algunos selectores de calidad no tenían nombre accesible.                               | Encabezado de historial para lectores de pantalla y nombres accesibles en los selectores, sin alterar el diseño visual.                                                                                                                    |

Las seis opciones habituales de pantallas son **ORIGINAL C/M, ORIGINAL, INCELL C/M, INCELL, OLED y AMOLED**. Se pueden escribir otras especificaciones. «Sin marco», «SM» y «S/M» se omiten en Original e Incell; «con marco» sigue siendo una distinción relevante.

## Organización de archivos

Se mantuvo la estructura por capas para conservar rutas e importaciones:

```text
src/app/                  Páginas, estados de carga y API de Next.js
src/components/           Interfaz reutilizable
src/components/labels/    Editor, vista previa e impresión de etiquetas
src/lib/                  Reglas compartidas de catálogo, precios, ventas y etiquetas
src/lib/models/           Esquemas de MongoDB
src/lib/security/         Sesiones, autorización, límites y transacciones
src/lib/ai/               Contratos, propuestas, confirmaciones y herramientas IA
src/lib/whatsapp/         Identidad, recepción, entrega y proveedores
src/data/                 Datos iniciales utilizados por la aplicación
scripts/tests/            Pruebas unitarias y de regresión
scripts/tests/helpers/    Cargador de fuentes TypeScript para las pruebas nuevas
scripts/verify-web.cjs    Verificación HTTP de la web, sin operaciones comerciales
scripts/verify-bot-integration.cjs
                          Integración real en una base temporal
whatsapp-bridge/          Servicio local de WhatsApp y sus dependencias
docs/                    Informes y evidencias de las revisiones
```

La lógica de calidad permanece centralizada en `categories.ts`; no se añadieron reglas distintas por tarjeta o por modelo de teléfono. Se incorporó un cargador compartido para las pruebas nuevas y un comando reutilizable de verificación HTTP. No se movieron scripts o archivos de datos existentes sin conocer sus usos externos. Los informes anteriores se conservan como historial.

`.env.local`, las credenciales de acceso, la sesión de WhatsApp y las colas locales siguen excluidos de Git. Se añadió `.npm-cache/` a los excluidos para no publicar los archivos temporales de la auditoría. No se instalaron dependencias nuevas ni se cambiaron versiones de paquetes.

Las páginas grandes de inventario, POS y administración pueden dividirse gradualmente en componentes más pequeños. Esta revisión priorizó corregir comportamientos y compartir reglas; no hizo una reorganización cosmética extensa de esas páginas.

## Verificación

- **81 pruebas automatizadas** pasaron. Incluyen diez pruebas nuevas de esta auditoría y las regresiones previas de seguridad, categorías, búsqueda, calidades, bot, precios y devoluciones.
- **TypeScript:** `npm run typecheck` pasó.
- **Compilación de producción:** `npm run build` pasó y el despliegue final de Vercel volvió a compilar y validar los tipos correctamente.
- **Integración real:** la suite usa una base nueva `codex_bot_verification_<aleatorio>`, comprueba el nombre antes de trabajar y la elimina al finalizar. Nunca utiliza el nombre de la base comercial. Comprueba rollback, confirmaciones simultáneas, reintentos, ventas/devoluciones, importación, categorías, visibilidad, versiones antiguas y protección del historial.
- **Dependencias:** `npm audit` de la aplicación, incluyendo desarrollo, y auditoría de producción del puente devolvieron cero vulnerabilidades conocidas en ese momento. No equivale a una garantía frente a vulnerabilidades futuras.
- **Sintaxis:** se comprobaron los archivos JavaScript del puente y el arranque local.
- **Navegador:** búsqueda A12, cuadrícula/lista, catálogo móvil de 390 px y apertura de las secciones administrativas. El recorrido inicial no mostró errores de consola ni desbordamiento horizontal de página en las secciones comprobadas.
- **Comprobación HTTP de la entrega:** pasaron **39 comprobaciones** en `https://elarca-displayclub.vercel.app`, con 169 productos públicos válidos en el momento de la prueba. Incluye las nueve páginas administrativas, recursos, APIs, tasa/contacto, autorización, rechazo CSRF y revocación de sesión.
- **Asistente real:** pasó una consulta de solo lectura a Gemini sobre la tasa del negocio. El QR local indicó WhatsApp conectado y el panel de producción confirmó una señal reciente. No se enviaron mensajes a contactos para realizar estas comprobaciones.
- **Publicación:** Vercel completó el despliegue y asignó el dominio de producción. Después de publicarlo se reabrieron inventario, historial, duplicados y etiquetas sin errores de consola detectados.

Evidencias guardadas: [recorrido del navegador y dimensiones](qa-auditoria-web-2026-10-30.json) y [captura móvil de la versión publicada](qa-auditoria-web-2026-10-30.png). El catálogo público ya no ofrece ORIGINAL S/M en el filtro de calidades.

Se revisaron catálogo, POS, inventario, historial, duplicados, ocultos, etiquetador, asistente y panel WhatsApp. Las acciones comerciales, devoluciones y fusiones se probaron en la base temporal; no se generaron ventas ni se modificó el stock comercial para comprobarlas.

## Cómo repetir las comprobaciones

Desde la raíz del proyecto:

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
npm audit --json
npm --prefix whatsapp-bridge audit --omit=dev --json

# Requiere la contraseña administrativa configurada, sin imprimirla:
npm run verify:web -- https://elarca-displayclub.vercel.app
```

`verify:web` comprueba páginas y recursos, catálogo, tasa, contacto, APIs protegidas, sesión, rechazo de origen ajeno y revocación al cerrar sesión. No crea órdenes, cambia stock ni envía mensajes de WhatsApp. El acceso y cierre de sesión utilizan únicamente una sesión temporal propia del verificador.

## Límites y precauciones operativas

- Una fusión con ventas en el secundario queda bloqueada. Si solo uno tiene ventas, debe conservarse como principal; si ambos tienen ventas, se mantienen separados. No se fusionaron referencias comerciales durante la auditoría.
- No se probaron impresoras físicas Bluetooth/USB, lectura en un teléfono receptor ni políticas de proveedores externos mediante envíos reales. Las pruebas automatizadas del transporte no sustituyen esas comprobaciones físicas.
- La disponibilidad de Gemini, elTOQUE, MongoDB y WhatsApp depende de servicios externos. Una respuesta correcta durante la revisión no garantiza disponibilidad permanente.
- No se reescribió el historial de Git, no se rotaron credenciales ni se eliminaron archivos del usuario. Los datos históricos conservan sus instantáneas; las nuevas lecturas/escrituras aplican las reglas corregidas.
- Las pruebas son evidencia del alcance descrito, no una garantía de ausencia absoluta de errores en cualquier situación futura.
