# Presentación de precios y navbar · 28 de octubre de 2026

## Cambios

- La navbar pública deja de mostrar el contador «Modelos» y su skeleton. Los contadores del catálogo y los de administración mantienen su función.
- La tasa se presenta en una sola línea también en móvil: **1 USD = 850 CUP**, usando siempre la tasa activa, no un valor fijo. Si falta, se indica que no está disponible.
- El componente compartido `ProductPrice` coloca ambos importes en horizontal, con moneda explícita, números tabulares y una separación vertical discreta. El equivalente USD deja de ser una nota de 10 px debajo del precio.
- Catálogo en cuadrícula y lista, tarjetas de administración, inventario, POS y productos ocultos comparten la presentación. Cada vista conserva su moneda principal; el selector de facturación del POS sigue funcionando.
- Los botones de consultar u ocultar tienen espacio propio bajo los importes. Los skeletons de catálogo y administración acompañan la nueva distribución.
- El bloque se adapta al ancho real de la tarjeta. En columnas estrechas se ajusta la tipografía, especialmente para importes largos con centavos; en tarjetas amplias se mantienen los tamaños mayores.
- Se conserva el cálculo de conversión y redondeo a centenas de CUP. No se modificaron precios guardados, importaciones, descuentos, tickets ni totales de ventas.

## Verificación

- Revisión de navegador a 320, 390, 768 y 793 px: documento sin desbordamiento horizontal y precios alineados en las vistas comprobadas.
- Caso de prueba con **167.000 CUP y 199,95 USD** en la columna estrecha de tablet: ambos importes en la misma fila.
- Panel, inventario y POS comprobados a 320 px con datos ficticios, sin realizar ventas. La base temporal se elimina al terminar.
- Compilación de producción con validación de tipos.

Este ajuste sustituye la presentación de la tasa en dos líneas descrita en `README-ajustes-ui-2026-10-28.md`.

## Limpieza posterior de tarjetas de administración

En `/admin` se retiran los distintivos «Más vendido» y «Bajo stock». Se conservan marca, calidad, categoría y cantidad de stock como información de trabajo. El catálogo público mantiene sus distintivos de venta, novedades y disponibilidad; no cambian los datos ni las reglas que los calculan.
