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
 * Normaliza y extrae códigos o tokens significativos de modelos de celulares.
 * Maneja formatos como "A02S / A03S / A04E / F04", "NOTE 11 4G", "11 PRO MAX", etc.
 */
export function extractModelTokens(modelText: string): string[] {
  if (!modelText) return [];

  // Convertir a mayúsculas y limpiar caracteres no alfanuméricos relevantes
  const upper = modelText
    .toUpperCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[/\\+&_,.-]/g, ' ')
    .replace(/\b(UNIVERSAL|INCELL|ORIGINAL|OLED|C\/M|S\/M|MARCO|SIN MARCO|CON MARCO|DISPLAY|PANTALLA|CON MARCO|C M|S M)\b/gi, ' ');

  // Dividir por espacios
  const rawTokens = upper.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);

  const tokens = new Set<string>();

  for (const token of rawTokens) {
    // Si contiene números o es una palabra clave de modelo (ej: A02S, NOTE, PRO, MAX, 11, G22)
    tokens.add(token);

    // Si alguien pegó códigos pegados como "F04A02S" o "A04E042", intentar separar sub-códigos con regex
    const subMatches = token.match(/([A-Z]*\d+[A-Z]*)/g);
    if (subMatches && subMatches.length > 1) {
      subMatches.forEach((sm) => {
        if (sm.length >= 2) tokens.add(sm);
      });
    }
  }

  return Array.from(tokens);
}

/**
 * Normalización simple para comparar strings completos sin espacios ni símbolos
 */
function cleanCompactString(str: string): string {
  return (str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Calcula la afinidad entre dos productos de la misma marca
 */
export function calculateDuplicateScore(
  a: Product,
  b: Product
): { score: number; matchingTokens: string[]; reasons: string[] } {
  // Misma marca obligatoria
  const marcaA = (a.marca || '').toUpperCase().trim();
  const marcaB = (b.marca || '').toUpperCase().trim();
  if (marcaA !== marcaB) {
    return { score: 0, matchingTokens: [], reasons: [] };
  }

  const reasons: string[] = [];
  const tokensA = extractModelTokens(a.modelo);
  const tokensB = extractModelTokens(b.modelo);

  // 1. Tokens compartidos significativos
  const tokenSetB = new Set(tokensB);
  const matchingTokens = tokensA.filter((t) => tokenSetB.has(t));

  // 2. Coincidencia exacta o contenida en string compacto
  const compactA = cleanCompactString(a.modelo);
  const compactB = cleanCompactString(b.modelo);
  const isExactCompact = compactA.length > 3 && compactA === compactB;
  const isContained =
    compactA.length > 5 &&
    compactB.length > 5 &&
    (compactA.includes(compactB) || compactB.includes(compactA));

  let score = 0;

  if (isExactCompact) {
    score = 98;
    reasons.push('Modelos idénticos');
  } else if (isContained) {
    score = Math.max(score, 88);
    reasons.push('Uno de los modelos contiene por completo al otro');
  }

  // Si hay tokens compartidos
  if (matchingTokens.length > 0) {
    const minTokens = Math.min(tokensA.length, tokensB.length);

    if (matchingTokens.length >= 3) {
      score = Math.max(score, 90 + Math.min(10, matchingTokens.length * 2));
      reasons.push(`Comparten ${matchingTokens.length} modelos compatibles (${matchingTokens.slice(0, 4).join(', ')})`);
    } else if (matchingTokens.length === 2) {
      score = Math.max(score, 75);
      reasons.push(`Comparten modelos compatibles (${matchingTokens.join(', ')})`);
    } else if (matchingTokens.length === 1 && minTokens <= 2) {
      // Si ambos son nombres cortos y comparten el código principal (ej: A02S)
      score = Math.max(score, 65);
      reasons.push(`Coincide el código principal: ${matchingTokens[0]}`);
    }
  }

  // Modificador por calidad (misma calidad aumenta la certeza)
  const calA = (a.calidad || '').toUpperCase().trim();
  const calB = (b.calidad || '').toUpperCase().trim();
  if (calA === calB) {
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
 * Escanea una lista de productos y devuelve los pares duplicados candidatos ordenados por afinidad.
 */
export function detectDuplicates(products: Product[], minScore = 60): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const seenPairKeys = new Set<string>();

  // Agrupar productos por marca para optimizar O(N)
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

        // Clave única no dirigida para el par
        const pairKey = [prodA.id, prodB.id].sort().join(':::');
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

  // Ordenar de mayor a menor afinidad
  return pairs.sort((a, b) => b.score - a.score);
}
