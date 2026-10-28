# Buscador y tarjetas — 28 de octubre de 2026

## Qué se corrigió

El buscador utiliza un motor propio de coincidencias aproximadas (fuzzy search), sin dependencia de Fuse.js. Antes podía aceptar diferencias en números de modelo y encontrar coincidencias accidentales en precios o fragmentos del identificador interno.

Ahora distingue los códigos: buscar A03 no devuelve A02; 5G no coincide con 4G. A03 puede encontrar A03S como variante de la familia, pero buscar A03S no devuelve A03 ni A04E. Las variantes Pro, Plus, Max, Ultra, Lite, SE, FE, Core y Note deben aparecer en el modelo, no simplemente en la calidad del producto.

Se mantienen tolerancia a errores de escritura y abreviaturas: `sansun a03`, `samsunga03`, `rn11`, `rm9a`, `ipon11` y `motog22`. También se entienden códigos con espacios (`A 03 S`), C/M y S/M, acentos y términos como regiones o tablillas de carga. OLED y AMOLED se distinguen.

La búsqueda consulta marca, modelo, calidad y categoría. El precio ya no produce resultados de modelo. El identificador completo sigue siendo válido para localizar un producto concreto. Todas las palabras significativas deben coincidir; las coincidencias exactas reciben mayor puntuación que las aproximadas donde la pantalla ordena por relevancia.

Los índices se reutilizan por producto y se actualizan cuando cambian sus datos. La consulta normalizada también se reutiliza. El campo público admite hasta 200 caracteres y el motor limita consultas excesivas. La búsqueda genérica conserva los valores cero.

El motor se comparte entre las pantallas que importan `fuzzyMatchProduct`; no se modificó el buscador transaccional de la IA ni sus reglas para confirmar operaciones. Se conservan las cuatro categorías planas, sin subcategorías.

## Diseño de las tarjetas

- Catálogo público: Consultar queda junto a los precios cuando el ancho disponible permite leer ambos importes. Se mantiene el botón verde y su enlace de WhatsApp.
- Administración: Ocultar pasa a un botón cuadrado de 40 × 40 píxeles, solo con su icono, alineado a la derecha de los precios. Conserva descripción accesible, tooltip y confirmación Sí, Ocultar / No.
- En columnas muy estrechas o importes largos, la acción puede ocupar otra línea para evitar recortes y precios ilegibles. No cambian los importes ni el redondeo.
- Se conserva la corrección del zoom del buscador en iPhone.

## Verificación

- `npm test`: 66 pruebas correctas, incluidas 8 nuevas pruebas del buscador.
- `npm run build`: compilación, tipos y comprobaciones de Next.js correctos.
- Navegador con catálogo temporal aislado: búsqueda `sansun a50`, tarjetas a 390 y 765 píxeles; administración a 320 píxeles sin desbordamiento horizontal.
- Botón de ocultar: comprobados tamaño, nombre accesible, apertura de confirmación y cancelación. No se ocultaron productos reales ni se enviaron mensajes de WhatsApp.

Las pruebas cubren los casos descritos; no representan una garantía de ausencia de cualquier error futuro. Los cambios no modifican ventas, existencias ni históricos del negocio.
