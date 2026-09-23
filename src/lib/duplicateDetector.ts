import { Product } from '@/lib/types';

export interface DuplicatePair {
  pairId: string;
  productA: Product;
  productB: Product;
  score: number; // 0 to 100
  matchingTokens: string[];
  reasons: string[];
}

/**
 * Palabras genéricas de marca, familia, calidad o marketing que NUNCA deben
 * considerarse como identificadores únicos de modelo para evitar falsos positivos
 * (por ejemplo, evitar que "REDMI 10C" coincida con "REDMI 9" solo por compartir "REDMI", "POWER", etc.).
 */
const STOPWORDS = new Set([
  'XIAOMI', 'REDMI', 'POCO', 'SAMSUNG', 'GALAXY', 'APPLE', 'IPHONE',
  'MOTOROLA', 'MOTO', 'HUAWEI', 'HONOR', 'ALCATEL', 'ZTE', 'TECNO',
  'INFINIX', 'VIVO', 'REALME', 'BLU', 'NOKIA', 'GOOGLE', 'SONY', 'LG',
  'POWER', 'PLUS', 'PRO', 'MAX', 'ULTRA', 'LITE', 'PRIME', 'PLAY', 'MINI',
  'SE', '4G', '5G', 'NEO', 'TURBO', 'FE', 'GT', 'YOUTH', 'COMPACT', 'ACTIVE',
  'DUAL', 'SIM', 'EDITION', 'VERSION', 'GLOBAL', 'EUROPA', 'LATAM', 'INDIA',
  'CHINA', 'NFC', 'NEW', 'DISPLAY', 'PANTALLA', 'TOUCH', 'LCD', 'OLED',
  'INCELL', 'ORIGINAL', 'AMOLED', 'FRAME', 'MARCO', 'SIN', 'CON', 'UNIVERSAL',
  'COMPATIBLE', 'AAA', 'OEM', 'RM', 'SAM', 'SM', 'IP', 'HW', 'C/M', 'S/M'
]);

/**
 * Normaliza y extrae códigos significativos de modelos (ej: 10C, C40, A02S, A03S, A04E, F04, 9A, Y16).
 * Requiere que contengan números o patrones alfanuméricos específicos de repuestos.
 */
export function extractModelTokens(modelText: string): string[] {
  if (!modelText) return [];

  const upper = modelText
    .toUpperCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[/\\+&_,.-]/g, ' ');

  const rawTokens = upper.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  const tokens = new Set<string>();

  for (const token of rawTokens) {
    if (STOPWORDS.has(token)) continue;

    // Un identificador real de modelo móvil debe contener al menos un dígito (ej: A02S, 10C, M2, 9A, G22)
    if (/\d/.test(token)) {
      tokens.add(token);
    }

    // Separar códigos pegados sin espacios como "F04A02S"
    const subMatches = token.match(/([A-Z]*\d+[A-Z]*)/g);
    if (subMatches && subMatches.length > 1) {
      subMatches.forEach((sm) => {
        if (sm.length >= 2 && !STOPWORDS.has(sm) && /\d/.test(sm)) {
          tokens.add(sm);
        }
      });
    }
  }

  return Array.from(tokens);
}

/**
 * Normalización para comparar strings compactos
 */
function cleanCompactString(str: string): string {
  return (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Calcula la afinidad real y no artificial entre dos productos de la misma marca
 */
export function calculateDuplicateScore(
  a: Product,
  b: Product
): { score: number; matchingTokens: string[]; reasons: string[] } {
  const marcaA = (a.marca || '').toUpperCase().trim();
  const marcaB = (b.marca || '').toUpperCase().trim();
  if (marcaA !== marcaB) {
    return { score: 0, matchingTokens: [], reasons: [] };
  }

  const compactA = cleanCompactString(a.modelo);
  const compactB = cleanCompactString(b.modelo);
  const reasons: string[] = [];

  const calA = (a.calidad || '').toUpperCase().trim();
  const calB = (b.calidad || '').toUpperCase().trim();

  // 1. Coincidencia idéntica exacta
  if (compactA.length > 3 && compactA === compactB) {
    if (calA === calB) {
      return { score: 100, matchingTokens: [a.modelo], reasons: ['Modelos y calidad idénticos'] };
    }
    return { score: 90, matchingTokens: [a.modelo], reasons: ['Mismo modelo exacto (distinta calidad)'] };
  }

  const tokensA = extractModelTokens(a.modelo);
  const tokensB = extractModelTokens(b.modelo);
  const tokenSetB = new Set(tokensB);

  // Filtrar tokens compartidos ignorando años solos (ej. 2021, 2022) a menos que haya otro modelo
  const rawMatching = tokensA.filter((t) => tokenSetB.has(t));
  const nonYearMatching = rawMatching.filter((t) => !/^(19\d\d|20\d\d)$/.test(t));
  const matchingTokens = nonYearMatching.length > 0 ? rawMatching : [];

  let score = 0;

  // Ver si uno contiene al otro completamente
  const isContained =
    compactA.length > 6 &&
    compactB.length > 6 &&
    (compactA.includes(compactB) || compactB.includes(compactA));

  if (matchingTokens.length >= 3) {
    score = 90 + Math.min(8, matchingTokens.length * 2);
    reasons.push(`Comparten ${matchingTokens.length} modelos compatibles (${matchingTokens.slice(0, 4).join(', ')})`);
  } else if (matchingTokens.length === 2) {
    score = 80;
    reasons.push(`Comparten modelos compatibles (${matchingTokens.join(', ')})`);
  } else if (matchingTokens.length === 1) {
    const minLen = Math.min(tokensA.length, tokensB.length);
    if (minLen === 1 && isContained) {
      score = 75;
      reasons.push(`Coincidencia de modelo único: ${matchingTokens[0]}`);
    }
  }

  // Si no hay modelos que coincidan, score = 0
  if (score === 0) {
    return { score: 0, matchingTokens: [], reasons: [] };
  }

  // Modificador por calidad
  if (calA === calB && score > 0) {
    score = Math.min(100, score + 5);
    reasons.push(`Misma calidad (${calA})`);
  }

  return {
    score: Math.min(100, Math.round(score)),
    matchingTokens,
    reasons,
  };
}

/**
 * Escanea la lista de productos y devuelve solo duplicados reales
 */
export function detectDuplicates(products: Product[], minScore = 75): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const seenPairKeys = new Set<string>();

  const byBrand = new Map<string, Product[]>();
  for (const p of products) {
    const brand = (p.marca || 'VARIOS').toUpperCase().trim();
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand)!.push(p);
  }

  for (const [, brandProducts] of byBrand) {
    if (brandProducts.length < 2) continue;

    for (let i = 0; i < brandProducts.length; i++) {
      for (let j = i + 1; j < brandProducts.length; j++) {
        const prodA = brandProducts[i];
        const prodB = brandProducts[j];

        const idA = String(prodA.id || (prodA as any)._id || `idx-${i}`);
        const idB = String(prodB.id || (prodB as any)._id || `idx-${j}`);
        const pairKey = [idA, idB].sort().join(':::');
        if (seenPairKeys.has(pairKey)) continue;

        const { score, matchingTokens, reasons } = calculateDuplicateScore(prodA, prodB);

        if (score >= minScore) {
          seenPairKeys.add(pairKey);
          pairs.push({
            pairId: pairKey,
            productA: prodA,
            productB: prodB,
            score,
            matchingTokens,
            reasons,
          });
        }
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score);
}
