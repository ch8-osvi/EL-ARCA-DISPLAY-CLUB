# Ajustes de interfaz · 28 de octubre de 2026

- **Catálogo público:** se elimina el selector USD/CUP. Todas las tarjetas y la vista de lista muestran CUP como precio principal y USD como equivalente, sin depender de una preferencia antigua guardada en el navegador.
- **Cabecera:** la tasa aplicada al catálogo está visible también en móvil. Se muestra en dos líneas compactas en pantallas pequeñas y en una línea en escritorio. Utiliza la misma tasa que los precios; si no está disponible, lo indica sin inventar una conversión.
- **Panel de administración:** los iconos de IA WhatsApp, Etiquetador, Exportar Excel, Unir Duplicados y Cargar Excel tienen el mismo pulso de dos segundos que Asistente IA. Solo cambia la opacidad del icono; los botones mantienen su tamaño y posición. Los seis respetan la preferencia de movimiento reducido del dispositivo.

## Verificación

- Compilación de producción y comprobación de tipos correctas.
- Navegador con datos ficticios: cabecera a 320 y 390 px sin desbordamiento horizontal y sin selector de moneda.
- Los seis SVG del panel tienen animación `pulse` de `2s`; sus botones tienen animación `none`.
- No se modificaron productos, ventas ni configuración de precios del negocio.
