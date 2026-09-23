/**
 * Intelligent Fuzzy & Token Search Engine for EL ARCA DISPLAY CLUB
 * Handles phonetic typos, brand aliases, unspaced queries ("redminote11", "sansun a03", "ipon 11", "a04e"),
 * and alphanumeric token variations with relevance scoring.
 */

export const BRAND_ALIASES: Record<string, string> = {
  // Common technician abbreviations
  rm: 'redmi',
  rn: 'redmi note',
  sm: 'samsung',
  sam: 'samsung',
  ip: 'iphone',
  iph: 'iphone',
  mot: 'motorola',
  moto: 'motorola',
  alc: 'alcatel',
  inf: 'infinix',
  tec: 'tecno',
  tek: 'tecno',
  itl: 'itel',
  hw: 'huawei',
  hua: 'huawei',
  hon: 'honor',
  pco: 'poco',
  rlm: 'realme',
  zt: 'zte',

  // Samsung variants & typos
  sansun: 'samsung',
  sansung: 'samsung',
  samsun: 'samsung',
  samsumg: 'samsung',
  samsum: 'samsung',
  samgun: 'samsung',
  sammsung: 'samsung',

  // iPhone / Apple typos
  ipon: 'iphone',
  aifon: 'iphone',
  ifon: 'iphone',
  ifone: 'iphone',
  iphon: 'iphone',
  apple: 'iphone',

  // Xiaomi / Redmi / Poco typos
  redminote: 'redmi note',
  redmi: 'redmi',
  xaomi: 'xiaomi',
  xiami: 'xiaomi',
  xiomi: 'xiaomi',

  // Motorola typos
  motog: 'moto g',
  motorla: 'motorola',

  // Alcatel typos
  alkatel: 'alcatel',
  alcater: 'alcatel',

  // Tecno / Infinix / Itel typos
  tekno: 'tecno',
  tecn: 'tecno',
  infonix: 'infinix',
  infiniks: 'infinix',
  itell: 'itel',

  // Huawei & Honor typos
  juawei: 'huawei',
  huawuei: 'huawei',
  hawei: 'huawei',
  onor: 'honor',

  // Realme & ZTE typos
  relme: 'realme',
  ztte: 'zte',
};

/** Normalize text by lowercasing, stripping diacritics/accents, and trimming */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Strips all spaces, slashes and punctuation, keeping only letters and digits */
export function compactSearchText(str: string | null | undefined): string {
  return normalizeSearchText(str).replace(/[^a-z0-9]/g, '');
}

/** Compute Levenshtein distance between two strings */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = [];
  for (let i = 0; i <= b.length; i++) row[i] = i;

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Intelligent matching for product cards/tables.
 * Returns { match: boolean, score: number }
 */
export function fuzzyMatchProduct(
  product: {
    marca: string;
    modelo: string;
    calidad?: string;
    precio?: number;
    id?: string;
  },
  query: string
): { match: boolean; score: number } {
  const trimmed = query.trim();
  if (!trimmed) return { match: true, score: 0 };

  const rawQ = normalizeSearchText(trimmed);
  const compQ = compactSearchText(trimmed);

  const fullText = normalizeSearchText(
    `${product.marca} ${product.modelo} ${product.calidad || ''} ${product.precio || ''} ${product.id || ''}`
  );
  const compTarget = compactSearchText(fullText);

  // 1. Direct unspaced substring match (e.g. "redminote11" matches "xiaomi redmi note 11")
  if (compQ.length >= 2 && compTarget.includes(compQ)) {
    const isExact = compTarget === compQ;
    return { match: true, score: isExact ? 1000 : 800 };
  }

  // 2. Expand known brand typos, abbreviations and prefixes in query
  let expandedQuery = rawQ;

  // Prefixes joined to numbers (e.g. motog22 -> motorola g 22, rn11 -> redmi note 11, rm9a -> redmi 9a, sm03 -> samsung 03)
  expandedQuery = expandedQuery.replace(/\bmotog(\d+)/g, 'motorola g $1');
  expandedQuery = expandedQuery.replace(/\brm(\d+)/g, 'redmi $1');
  expandedQuery = expandedQuery.replace(/\brn(\d+)/g, 'redmi note $1');
  expandedQuery = expandedQuery.replace(/\bsm(\d+)/g, 'samsung $1');
  expandedQuery = expandedQuery.replace(/\bip(\d+)/g, 'iphone $1');
  expandedQuery = expandedQuery.replace(/\bmoto(\d+)/g, 'motorola $1');
  expandedQuery = expandedQuery.replace(/\bredminote/g, 'redmi note ');

  for (const [alias, rep] of Object.entries(BRAND_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'g');
    expandedQuery = expandedQuery.replace(regex, rep);
  }

  const compExpandedQ = compactSearchText(expandedQuery);
  if (compExpandedQ.length >= 2 && compTarget.includes(compExpandedQ)) {
    return { match: true, score: 750 };
  }

  // 3. Tokenize query and target
  const queryTokens = expandedQuery
    .split(/[\s/,\-_+()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const targetTokens = fullText
    .split(/[\s/,\-_+()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  let totalScore = 0;

  // EVERY query token must find a match or close match in target
  for (const qToken of queryTokens) {
    let matchedToken = false;
    let bestTokenScore = 0;

    // Check against individual target tokens
    for (const tToken of targetTokens) {
      if (tToken === qToken) {
        matchedToken = true;
        bestTokenScore = Math.max(bestTokenScore, 100);
        break;
      }
      if (tToken.startsWith(qToken) || qToken.startsWith(tToken)) {
        matchedToken = true;
        bestTokenScore = Math.max(bestTokenScore, 80);
      } else if (tToken.includes(qToken) || qToken.includes(tToken)) {
        matchedToken = true;
        bestTokenScore = Math.max(bestTokenScore, 65);
      }

      // Levenshtein typo tolerance for tokens >= 3 chars
      if (qToken.length >= 3 && tToken.length >= 3) {
        const maxDist = qToken.length <= 4 ? 1 : 2;
        const dist = levenshteinDistance(qToken, tToken);
        if (dist <= maxDist) {
          matchedToken = true;
          bestTokenScore = Math.max(bestTokenScore, 50 - dist * 10);
        }
      }
    }

    // Fallback: check if the unspaced target contains the token
    if (!matchedToken && qToken.length >= 2) {
      if (compTarget.includes(compactSearchText(qToken))) {
        matchedToken = true;
        bestTokenScore = Math.max(bestTokenScore, 60);
      }
    }

    if (!matchedToken) {
      return { match: false, score: 0 };
    }

    totalScore += bestTokenScore;
  }

  return { match: true, score: totalScore };
}

/**
 * Generic fuzzy matcher for arbitrary fields (sales history, mermas, clients, etc.)
 */
export function fuzzyMatchGeneric(
  fields: (string | number | undefined | null)[],
  query: string
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const rawQ = normalizeSearchText(trimmed);
  const compQ = compactSearchText(trimmed);

  const fullText = normalizeSearchText(fields.filter(Boolean).join(' '));
  const compTarget = compactSearchText(fullText);

  // Unspaced match
  if (compQ.length >= 2 && compTarget.includes(compQ)) {
    return true;
  }

  // Tokenize & expand aliases
  let expandedQuery = rawQ;
  expandedQuery = expandedQuery.replace(/\bmotog(\d+)/g, 'motorola g $1');
  expandedQuery = expandedQuery.replace(/\brm(\d+)/g, 'redmi $1');
  expandedQuery = expandedQuery.replace(/\brn(\d+)/g, 'redmi note $1');
  expandedQuery = expandedQuery.replace(/\bsm(\d+)/g, 'samsung $1');
  expandedQuery = expandedQuery.replace(/\bip(\d+)/g, 'iphone $1');
  expandedQuery = expandedQuery.replace(/\bmoto(\d+)/g, 'motorola $1');
  expandedQuery = expandedQuery.replace(/\bredminote/g, 'redmi note ');

  for (const [alias, rep] of Object.entries(BRAND_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'g');
    expandedQuery = expandedQuery.replace(regex, rep);
  }

  const queryTokens = expandedQuery
    .split(/[\s/,\-_+()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const targetTokens = fullText
    .split(/[\s/,\-_+()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const qToken of queryTokens) {
    let matchedToken = false;

    for (const tToken of targetTokens) {
      if (tToken === qToken || tToken.includes(qToken) || qToken.includes(tToken)) {
        matchedToken = true;
        break;
      }
      if (qToken.length >= 3 && tToken.length >= 3) {
        const maxDist = qToken.length <= 4 ? 1 : 2;
        if (levenshteinDistance(qToken, tToken) <= maxDist) {
          matchedToken = true;
          break;
        }
      }
    }

    if (!matchedToken && qToken.length >= 2) {
      if (compTarget.includes(compactSearchText(qToken))) {
        matchedToken = true;
      }
    }

    if (!matchedToken) return false;
  }

  return true;
}

/**
 * Exact rounding in Cuban Pesos (CUP):
 * Rounds to the nearest multiple of 100 for practical Cuban cash handling.
 * E.g.: 9,550 -> 9,600 | 9,540 -> 9,500 | 9,800 -> 9,800 | 9,890 -> 9,900
 */
export function roundCupPrice(priceUSD: number, rate: number): number {
  if (!priceUSD || !rate || rate <= 0) return 0;
  const rawCUP = priceUSD * rate;
  return Math.round(rawCUP / 100) * 100;
}
