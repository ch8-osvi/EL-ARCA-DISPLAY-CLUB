# Migración acotada de la tasa

Una sola tasa activa del negocio, consultada por catálogo, POS, inventario, WhatsApp e IA. La referencia de elTOQUE no cambia precios sin la acción existente de aplicar. Las ventas históricas conservan su tasa original.

1. Sustituir Telegram por GET /v1/trmi en servidor; clave ELTOQUE_API_TOKEN privada. Cache persistente de una hora y reintentos espaciados, con exclusión entre instancias.
2. Validar USD numérico positivo, fecha y hora del proveedor. Guardar por separado hora recibida (zona no especificada), instante de consulta y ventana móvil de 24 horas.
3. Conservar el último dato válido ante fallos. Marcar referencia desactualizada a las dos horas sin verificación y bloquear su aplicación. Mostrar también errores de consulta.
4. Refrescar clientes cada minuto y al recuperar foco; confirmar guardados antes de actualizar la pantalla. No inventar 300/320 si falta configuración.
5. Leer tasa del servidor antes de modificar stock; rechazar ventas con una tasa de pantalla que ya cambió. Unificar escritura atómica desde POS e IA.
6. Probar validación, errores y compilación; publicar GitHub y comprobar Vercel. No modificar históricos, redondeos, diseño general ni agregar gráficas.

La planificación horaria usa GitHub Actions como antes. Sus horarios pueden retrasarse; las consultas del panel también refrescan el dato cuando vence el cache. No se promete ejecución exacta al minuto.
