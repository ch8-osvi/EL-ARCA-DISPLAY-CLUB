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
 * Parses raw text containing one or more product entries formatted like:
 * "▪️ ALCATEL 1S 2020/5028 (ORIGINAL) x15 - $14"
 * or newline-separated lists.
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
    // Supports: x15 - $14, x 20 - $14.50, x5 - 14, x1 - $17.50, etc.
    const match = raw.match(/^(.*?)\s*x\s*(\d+)\s*[-–:]\s*\$?([0-9]+(?:\.[0-9]+)?)\s*$/i);
    if (!match) continue;

    let desc = match[1].trim();
    const stock = parseInt(match[2], 10);
    const precio = parseFloat(match[3]);

    if (isNaN(stock) || stock < 0 || isNaN(precio) || precio <= 0) continue;

    // 1. Extract quality inside parentheses if present, e.g. (ORIGINAL), (INCELL), (AAA)
    let calidad = 'ORIGINAL C/M';
    const qualityMatch = desc.match(/\((ORIGINAL|INCELL|OLED|AMOLED|AAA|COMPATIBLE|ORIGINA-[^\)]*|[^)]*C\/M[^)]*|[^)]*S\/M[^)]*)\)/i);
    if (qualityMatch) {
      const q = qualityMatch[1].toUpperCase().trim();
      if (q.includes('INCELL')) calidad = 'INCELL';
      else if (q.includes('ORIGINA')) calidad = 'ORIGINAL';
      else if (q.includes('AAA')) calidad = 'AAA';
      else if (q.includes('OLED')) calidad = 'OLED';
      else calidad = q;

      // Remove quality tag from description
      desc = desc.replace(qualityMatch[0], '').trim();
    }

    // 2. Detect Brand
    let marca = 'GENERICO';
    const upperDesc = desc.toUpperCase();

    if (/^RM\b/i.test(upperDesc)) {
      marca = 'XIAOMI';
      desc = desc.replace(/^RM\s*/i, 'REDMI ');
    } else if (/^IPHONE\b/i.test(upperDesc)) {
      marca = 'APPLE';
      // keep IPHONE in model
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

    // Always 100% UPPERCASE as per project strict rule
    const finalMarca = marca.toUpperCase().trim();
    const finalModelo = desc.toUpperCase().replace(/\s+/g, ' ').trim();
    const finalCalidad = calidad.toUpperCase().trim();

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
