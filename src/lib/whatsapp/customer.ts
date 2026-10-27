import { type ProductCategory } from "../categories";
export function detectCategoryIntent(
  text: string,
): ProductCategory | undefined {
  const found = new Set<ProductCategory>();
  if (/pantalla|display|m[oó]dulo|lcd|oled|amoled/i.test(text))
    found.add("DISPLAY");
  if (/bater[ií]a|\bbattery\b/i.test(text)) found.add("BATERIA");
  if (/tapa|cubierta trasera|carcasa/i.test(text)) found.add("TAPA");
  if (/cargador|cable|aud[ií]fono|funda|protector|accesorio/i.test(text))
    found.add("ACCESORIO");
  return found.size === 1 ? [...found][0] : undefined;
}
export function customerSearchText(
  text: string,
  history: { sender: string; text: string }[],
) {
  const category = detectCategoryIntent(text);
  const lastUser = [...history].reverse().find((h) => h.sender === "user");
  if (/\d/.test(text)) {
    const previousCategory = lastUser && detectCategoryIntent(lastUser.text);
    return !category &&
      previousCategory &&
      !/\d/.test(lastUser!.text) &&
      text.trim().split(/\s+/).length <= 4
      ? `${previousCategory} ${text}`
      : text;
  }
  if (text.trim().split(/\s+/).length > 8) return text;
  const previous = [...history]
    .reverse()
    .find((h) => h.sender === "user" && /\d/.test(h.text));
  if (previous && category && text.trim().split(/\s+/).length <= 4)
    return (
      previous.text
        .replace(
          /pantallas?|displays?|bater[ií]as?|tapas?(?: traseras?)?|accesorios?/gi,
          "",
        )
        .slice(0, 250) +
      " " +
      text
    );
  return previous &&
    /precio|cu[aá]nto|dispon|stock|esa|ese|mismo|marco|original|incell|pesos|cup/i.test(
      text,
    )
    ? previous.text.slice(0, 250) + " " + text
    : text;
}
export function customerSocialReply(text: string, hasHistory: boolean) {
  if (
    /^(hola|buenas|buenos d[ií]as|buenas (tardes|noches)|saludos)[\s!.👋]*$/i.test(
      text.trim(),
    )
  )
    return hasHistory
      ? "¡Hola! Dime qué repuesto o modelo necesitas y lo reviso."
      : "¡Hola! 👋 Soy el asistente de El Arca. ¿Qué repuesto y modelo de teléfono buscas?";
  if (/^(muchas )?gracias( por todo)?[\s!.]*$/i.test(text.trim()))
    return "¡Con gusto!";
  if (
    /^(adi[oó]s|hasta luego|buenas noches y gracias)[\s!.]*$/i.test(text.trim())
  )
    return "¡Hasta luego! Gracias por escribirnos.";
  return undefined;
}
export const CUSTOMER_INSTRUCTIONS =
  "El usuario es cliente. Responde a su última pregunta, sin repetir saludos ni volver a presentar la tienda en cada turno. Usa de una a cuatro frases y solo una pregunta de aclaración si es necesaria. No menciones dirección, horarios, garantía, instalación, pagos ni envíos salvo que el cliente lo pregunte o sea imprescindible para resolver su consulta; si falta ese dato, dilo brevemente sin inventarlo ni añadir una lista de políticas desconocidas. No cierres cada mensaje con una invitación a comprar o una pregunta de venta. Usa el contexto para entender referencias como 'esa' o 'con marco', sin arrastrar modelos anteriores si cambió el modelo. Solo consulta catálogo público; no hay herramientas de escritura. No reveles finanzas ni stock exacto. No prometas reservas ni ventas realizadas. Distingue pantalla, batería, tapa y accesorio; no asumas que los tenemos todos para un modelo. Menciona únicamente categorías y variantes respaldadas por los productos verificados. No conviertas similitud de modelo en compatibilidad. Si pide una persona, indícale que escriba HUMANO.";
