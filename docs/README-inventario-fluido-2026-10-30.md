# Inventario: guardado fluido, teclado y búsqueda — 30/10/2026

Ruta: `/admin/pos/inventario`.

## Guardado

Editar, agregar un producto o sumar stock actualiza únicamente la tarjeta correspondiente con el producto confirmado por el servidor. Eliminar quita la tarjeta tras la confirmación del servidor. Estas operaciones ya no vuelven a consultar todo el inventario, las mermas y la tasa, ni muestran nuevamente los skeletons. Los filtros y la búsqueda se conservan. Los resultados siguen respetando los filtros: cambiar marca, categoría o disponibilidad puede sacar una tarjeta del resultado actual.

Se conserva `updatedAt` de la respuesta para proteger la siguiente edición frente a cambios concurrentes. Si falla una escritura, el formulario conserva lo introducido y las tarjetas conservan sus datos anteriores. Mientras se guarda, se impide cerrar el formulario y repetir el envío. Si una respuesta excepcional no incluye producto, se consulta el inventario conservando las tarjetas visibles.

## Atajos exclusivos de esta ruta

| Teclas | Acción |
| --- | --- |
| Ctrl + F2 | Abre la vista de stock, enfoca el buscador y selecciona su texto. |
| ↓ / ↑ desde el buscador | Enfoca el primer / último resultado visible. |
| ↓ / ↑ sobre una tarjeta | Recorre los resultados en orden. |
| Enter sobre una tarjeta | Abre su edición. |
| Ctrl + Enter dentro de alta, edición o entrada de stock | Envía el formulario respetando su validación. |
| Esc | Cierra el formulario o historial y devuelve el foco al control anterior, o al buscador si aquel ya no está disponible. No cierra durante una escritura pendiente. |

En equipos que usan Meta, también se admite Meta + F2 y Meta + Enter. Las flechas dentro de campos, listas y botones conservan su comportamiento normal. Ctrl + Enter no confirma eliminaciones.

## Corrección conservadora del buscador

La normalización existente interpretaba `note 8 p` como `note 8p`, un código distinto de `8 pro`. Se mantiene primero la búsqueda existente y, únicamente si no coincide, se comprueba si la última letra separada de un número empieza una variante del modelo (Pro, Plus, Max, Lite, etc.). Esa alternativa exige la variante en el modelo; el texto de calidad no puede inventarla.

`note 8`, `note 8 p`, `note 8 pr`, `note 8 pro`, `rm note 8 p` y `rn8 p` encuentran REDMI NOTE 8 PRO. Se preservan abreviaturas, tolerancia a errores, ranking existente, números, códigos como `A 03 S`, tecnologías y versiones 4G/5G. No se modifica la búsqueda genérica de historial y mermas ni la resolución de productos para escrituras de IA. El motor de productos es compartido, por lo que esta corrección puntual también beneficia a sus otras vistas.

## Verificación

- `npm test`: 84 pruebas aprobadas, incluidas las regresiones del buscador y una prueba de los manejadores reales de la página con peticiones controladas.
- La prueba de interacción verifica guardado demorado sin ocultar tarjetas ni emitir GET adicionales, precio confirmado, conservación de `updatedAt`, rechazo de stock, conservación del formulario y atajos.
- Los datos usados por esa prueba son sintéticos; no cambia precios ni existencias del negocio.
- `npm run typecheck` y `npm run build`: aprobados, también la compilación de producción en Vercel.
- En producción se reprodujo primero el fallo original (cero resultados para `note 8 p`) y, tras publicar, se comprobaron las seis consultas indicadas arriba con REDMI NOTE 8 PRO visible.
- Navegador real: Ctrl + F2 enfoca y selecciona el buscador; ↓ enfoca un resultado; Enter abre su edición; Ctrl + Enter con un modelo vacío mantiene el formulario y activa la validación; Esc cierra. Consola sin errores. No se enviaron cambios comerciales durante esta comprobación.
- Vista móvil de 390 px: ancho del documento de 382 px, sin desbordamiento horizontal de la página.
- Publicado en [elarca-displayclub.vercel.app](https://elarca-displayclub.vercel.app/admin/pos/inventario). [Captura de la búsqueda corregida](qa-inventario-fluido-2026-10-30.png).

La actualización visual ocurre al confirmar la respuesta del servidor. La latencia de la conexión y de la base de datos sigue determinando cuánto dura «Guardando…».

## Corrección de modelos largos al guardar precio o stock

Se corrigió una validación de la auditoría previa que limitaba todos los textos a 200 caracteres. El catálogo original ya contenía listas de compatibilidad de hasta 282 caracteres; al volver a enviarlas desde la edición, la API rechazaba incluso cambios de precio o stock.

La API admite ahora hasta 2000 caracteres en `modelo`, conservando 200 para marca y calidad. El formulario envía únicamente los campos modificados y la versión `updatedAt`. Así, una edición de precio o stock tampoco reescribe los textos heredados. No se recortan ni se sustituyen nombres existentes.

Se amplió la prueba de interacción con un nombre largo del catálogo original y se añadió una regresión en la integración con base temporal: envío completo con modelo largo, precio solo, stock solo y edición de una lista larga; también se comprueba que modelos vacíos, objetos y textos superiores a 2000 caracteres sigan rechazados.

Verificación completada: 84 pruebas, compilación y toda la integración temporal aprobadas. En producción, una petición con modelo largo e identificador aleatorio inexistente llega a «Producto no encontrado» (404), confirmando que supera la validación; 2001 caracteres se rechazan con 400. No se escribieron productos del negocio. El navegador confirmó además un modelo real de 322 caracteres, formulario correcto y consola sin errores. [Captura del formulario revisado](qa-modelo-largo-2026-10-30.png).

## Fluidez al cambiar categorías y disponibilidad

La versión anterior montaba 265 tarjetas y 12607 elementos dentro de `main` al entrar en Pantallas. Volver desde una categoría vacía obligaba al navegador a construir toda esa cuadrícula de una vez, con un desenfoque por tarjeta.

El inventario ahora muestra primero 40 resultados y añade bloques de 40 al desplazarse hacia el final. También hay un botón «Mostrar más productos» que funciona sin IntersectionObserver y con teclado. La búsqueda, los filtros y sus contadores siguen usando todos los productos descargados, incluidos los que aún no se han dibujado. Cambiar cualquier filtro reinicia el bloque visible; guardar un precio o stock conserva la cantidad visible mientras no cambien los filtros.

Se reutiliza la lista ordenada al cambiar disponibilidad o marca y se desactiva el desenfoque solo en las tarjetas de inventario, conservando colores y controles. Los cambios de filtro y la ampliación de resultados no realizan peticiones adicionales. ↓ sobre la última tarjeta visible añade el bloque siguiente y enfoca el próximo producto. ↑ desde el buscador lleva a la última tarjeta actualmente visible.

La prueba de interacción incluye 81 productos sintéticos: 40 tarjetas iniciales, ampliación a 80 y 81, búsqueda del último registro, reinicio de bloques, cambio entre disponibles/agotados y vuelta desde Baterías vacía a Pantallas. También conserva las comprobaciones de guardado, modelo largo, errores y atajos. No se añade ninguna dependencia ni se cambia la lógica de coincidencia del buscador.

Verificación publicada: primer render de 40 tarjetas y 2034 elementos en `main` frente a 265 y 12607 anteriores. Se comprobaron Baterías vacía → Pantallas, Disponibles (164) y Agotados (101), siempre con un bloque inicial máximo de 40. ↓ sobre la tarjeta 40 añadió el siguiente bloque y enfocó la tarjeta 41; el desplazamiento continuó añadiendo resultados automáticamente. La búsqueda encontró BLACKVIEW A80 PRO desde el bloque inicial y siguió encontrando REDMI NOTE 8 PRO con `note 8 p`. Consola sin errores; móvil de 390 px sin desbordamiento (documento de 382 px). 84 pruebas y compilación local y de producción aprobadas. [Captura del inventario optimizado](qa-filtros-inventario-2026-10-30.png).
