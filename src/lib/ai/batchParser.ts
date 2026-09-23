/**
 * Robust Deterministic Parser for Large Product Batches (5 to 500+ items).
 * Extracts structured product data directly from raw text pastes (e.g. from WhatsApp, Excel, or chat)
 * without consuming LLM token limits or risking cutoffs.
 */

export interface ParsedBatchProduct {
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock: number;
}

const KNOWN_BRANDS = [
  'SAMSUNG',
  'XIAOMI',
  'MOTOROLA',
  'HUAWEI',
  'IPHONE',
  'APPLE',
  'LG',
  'ALCATEL',
  'OPPO',
  'REALME',
  'TCL',
  'TECNO',
  'INFINIX',
  'VIVO',
  'ZTE',
  'NOKIA',
  'HONOR',
  'POCO',
  'ONEPLUS',
  'REDMI',
  'ITEL',
  'BLU',
  'BLACKVIEW',
  'GOOGLE',
  'SONY',
];

/**
 * Normaliza y separa limpiamente el nombre del modelo de su tecnología de panel y marco.
 * Garantiza que:
 * - El modelo nunca contenga paréntesis de calidad como "(INCELL)" o "(ORIGINAL)"
 * - La calidad se consolide siempre en formato canónico (ej: "INCELL C/M", "ORIGINAL C/M", "OLED C/M")
 */
export function cleanModelAndQuality(rawModel: string, rawQuality?: string): { modelo: string; calidad: string } {
  let model = (rawModel || '').toUpperCase().trim();
  const qualityInput = (rawQuality || '').toUpperCase().trim();

  // 1. Detectar tecnología de pantalla
  let tech = '';
  if (/INCELL/i.test(model) || /INCELL/i.test(qualityInput)) {
    tech = 'INCELL';
  } else if (/ORIGINA/i.test(model) || /ORIGINA/i.test(qualityInput)) {
    tech = 'ORIGINAL';
  } else if (/AMOLED/i.test(model) || /AMOLED/i.test(qualityInput)) {
    tech = 'AMOLED';
  } else if (/OLED/i.test(model) || /OLED/i.test(qualityInput)) {
    tech = 'OLED';
  } else if (/\bAAA\b/i.test(model) || /\bAAA\b/i.test(qualityInput)) {
    tech = 'AAA';
  } else if (/COMPATIBLE/i.test(model) || /COMPATIBLE/i.test(qualityInput)) {
    tech = 'COMPATIBLE';
  } else {
    tech = 'ORIGINAL';
  }

  // 2. Detectar marco: C/M (Con Marco) vs S/M (Sin Marco)
  let frame = 'C/M'; // Estándar predeterminado del negocio
  if (/\b(S\/M|SIN MARCO|S M|SINMARCO)\b/i.test(model) || /\b(S\/M|SIN MARCO|S M|SINMARCO)\b/i.test(qualityInput)) {
    frame = 'S/M';
  } else if (/\b(C\/M|CON MARCO|C M|CONMARCO)\b/i.test(model) || /\b(C\/M|CON MARCO|C M|CONMARCO)\b/i.test(qualityInput)) {
    frame = 'C/M';
  }

  // 3. Limpiar modelo: eliminar paréntesis de calidad y palabras de marco
  model = model
    .replace(/\s*\((ORIGINAL|INCELL|OLED|AMOLED|AAA|COMPATIBLE|ORIGINA-[^\)]*|[^)]*C\/M[^)]*|[^)]*S\/M[^)]*)\)\s*/gi, ' ')
    .replace(/\b(INCELL|ORIGINAL|AMOLED|OLED|AAA|COMPATIBLE)\b/gi, ' ')
    .replace(/\b(C\/M|S\/M|CON MARCO|SIN MARCO|C M|S M)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  model = model.replace(/^[\s/\\-]+|[\s/\\-]+$/g, '').trim();

  return {
    modelo: model,
    calidad: `${tech} ${frame}`,
  };
}

/**
 * Parsea texto crudo conteniendo listas de repuestos:
 * "▪️ SAMSUNG A20/A205F (INCELL) C/M x10 - $15"
 */
export function parseBatchProductsFromText(text: string): ParsedBatchProduct[] {
  if (!text || typeof text !== 'string') return [];

  // Split by bullets, emojis, or newlines
  const rawItems = text
    .split(/(?:▪️|•|🔹|🔸|\r?\n)+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const parsed: ParsedBatchProduct[] = [];

  for (const raw of rawItems) {
    // Pattern: [PRODUCT DESCRIPTION] x[STOCK] - $[PRICE] (or - [PRICE])
    const match = raw.match(/^(.*?)\s*x\s*(\d+)\s*[-–:]\s*\$?([0-9]+(?:\.[0-9]+)?)\s*$/i);
    if (!match) continue;

    let desc = match[1].trim();
    const stock = parseInt(match[2], 10);
    const precio = parseFloat(match[3]);

    if (isNaN(stock) || stock < 0 || isNaN(precio) || precio <= 0) continue;

    // Detectar Marca
    let marca = 'GENERICO';
    const upperDesc = desc.toUpperCase();

    if (/^RM\b/i.test(upperDesc)) {
      marca = 'XIAOMI';
      desc = desc.replace(/^RM\s*/i, 'REDMI ');
    } else if (/^IPHONE\b/i.test(upperDesc)) {
      marca = 'APPLE';
    } else {
      for (const b of KNOWN_BRANDS) {
        const regex = new RegExp(`^${b}(?:\\s*\\/\\s*\\w+)?\\s+`, 'i');
        if (regex.test(desc)) {
          marca = b;
          desc = desc.replace(regex, '').trim();
          break;
        }
      }

      // If no explicit brand name, detect by common model prefixes
      if (marca === 'GENERICO') {
        if (/^([AMFS]\d+|GALAXY)\b/i.test(desc) || /^([AMFS]\d+)/i.test(desc)) {
          marca = 'SAMSUNG';
        } else if (/^(BLADE)\b/i.test(desc)) {
          marca = 'ZTE';
        } else if (/^(REDMI|MI\s*\d|POCO)\b/i.test(desc)) {
          marca = 'XIAOMI';
        } else if (/^(MOTO|ONE\s*5G)\b/i.test(desc)) {
          marca = 'MOTOROLA';
        } else if (/^(HOT|SMART|SPARK|POP)\b/i.test(desc)) {
          marca = 'TECNO';
        }
      }
    }

    // Clean up accidental duplicate brand prefix in model: e.g. "MOTOROLA E 2020" -> "E 2020"
    if (marca !== 'GENERICO' && marca !== 'APPLE') {
      const dupRegex = new RegExp(`^${marca}\\s+`, 'i');
      desc = desc.replace(dupRegex, '').trim();
    }

    // Aplicar normalización estricta de modelo y calidad
    const { modelo: finalModelo, calidad: finalCalidad } = cleanModelAndQuality(desc);
    const finalMarca = marca.toUpperCase().trim();

    if (finalModelo.length > 0) {
      parsed.push({
        marca: finalMarca,
        modelo: finalModelo,
        calidad: finalCalidad,
        precio,
        stock,
      });
    }
  }

  return parsed;
}
