# Cuatro categorías planas · 28 de octubre de 2026

La tienda mantiene exactamente cuatro categorías, sin subcategorías, selectores de tipo ni filtros internos:

| Categoría visible | Contenido | Icono compartido |
| --- | --- | --- |
| Pantallas | Displays y módulos de pantalla | Pantalla |
| Baterías | Baterías | Batería |
| Repuestos | Tapas traseras, centros/tablillas de carga (regiones), flex y otras piezas | Un único símbolo de componentes |
| Accesorios y herramientas | Cables, cargadores, complementos y herramientas de reparación, todo junto | Una única herramienta |

## Cómo se muestran los productos

Las tarjetas de tapas, flex y centros de carga dicen **Repuestos**, con el mismo icono. Los accesorios y herramientas dicen **Accesorios y herramientas**, también con el mismo icono. No aparece otra etiqueta que clasifique esas piezas.

La pieza concreta se identifica en el nombre del producto: `TAPA TRASERA A50`, `FLEX DE CARGA A50`, `CENTRO DE CARGA A50` o `PINZA DE PRECISIÓN`. Así no hay varias tarjetas indistinguibles llamadas solo «A50», ni se suman existencias de piezas diferentes.

Los formularios de alta y edición conservan un único selector de categoría con cuatro opciones. El campo «Producto / modelo» orienta con ejemplos según la categoría; no se añadió un campo de subcategoría.

## Alcance

- Catálogo público, filtros, contadores y buscador.
- Administración, inventario, POS y carrito.
- Tarjetas y selectores del gestor de etiquetas, ocultos y duplicados mediante los componentes compartidos.
- Historial, devoluciones y comprobantes.
- Importación y exportación Excel.
- API, esquemas de datos, herramientas y contexto de IA/WhatsApp.

Se mantiene el diseño aprobado: fondos, bordes, colores, precios horizontales y badges públicos. Administración continúa sin los badges promocionales retirados.

## Compatibilidad con datos anteriores

- Los códigos actuales son `DISPLAY`, `BATERIA`, `REPUESTO` y `ACCESORIO`. Este último conserva su ID anterior y amplía el nombre visible a «Accesorios y herramientas».
- `TAPA` se acepta como valor heredado y se interpreta como **Repuestos**. No es una quinta categoría visible ni una subcategoría.
- Una tapa antigua cuyo modelo era solo `A50` se presenta como `TAPA TRASERA A50`, recuperando en el nombre la información que antes daba su categoría. Se conservan ID, precio, stock y referencias de venta.
- Las lecturas adaptan esa representación sin ejecutar una migración masiva sobre el negocio. Las altas, ediciones/importaciones y guardados normales escriben la categoría actual cuando corresponde.
- Las ventas antiguas pueden conservar su valor original `TAPA`. Sus importes, unidades e historial no se reescriben; se admite devolverlas y mostrar su nombre de pieza correctamente.
- La importación acepta nombres anteriores como «Tapas traseras», «Flex», «Regiones», «Tablillas de carga» o «Herramientas». Se traducen a una de las cuatro categorías. Los nombres conocidos de piezas se conservan en el nombre del producto.
- Excel mantiene la columna `CATEGORIA` y los IDs estables. Las exportaciones utilizan las cuatro categorías actuales; no se añadió una columna de subcategoría.

## Búsqueda, IA y duplicados

La IA entiende «región» o «tablilla» como un centro de carga dentro de Repuestos. Distingue «flex de carga» de «centro de carga» buscando palabras del nombre del producto; no crea categorías nuevas para hacerlo. Conserva también la pieza solicitada si el cliente dice primero «Busco un flex» y después «A50».

Las propuestas nuevas de herramientas usan solo las cuatro categorías actuales. Las altas antiguas que indicaban `TAPA` se normalizan conservando el nombre de la pieza.

Compartir Repuestos no convierte una tapa y un flex del mismo teléfono en duplicados. Para Repuestos y Accesorios y herramientas, la comparación automática exige el mismo nombre normalizado, además de marca y calidad. Se conserva la comparación específica anterior para pantallas y baterías.

## Verificación

- **58 pruebas unitarias:** las 53 anteriores y cinco nuevas para categorías planas, nombres heredados, búsquedas, propuestas IA y duplicados.
- Integración en MongoDB temporal: lectura de una tapa heredada, alta sin duplicar su ID, flex y centro de carga separados, herramientas dentro de accesorios, importación antigua y devolución de una venta histórica con categoría `TAPA`.
- Pruebas de búsqueda que distinguen región, flex y tapa del mismo teléfono.
- Compilación de producción con comprobación de tipos.
- Revisión responsive de categorías y tarjetas con productos ficticios de las cuatro categorías.

No se cambiaron claves, contraseñas, importes históricos ni el alojamiento local del bot. No se enviaron mensajes a clientes ni se realizaron ventas de prueba en la base del negocio.
