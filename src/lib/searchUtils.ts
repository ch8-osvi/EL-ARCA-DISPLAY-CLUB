import {
  categoryLabel,
  productCategory,
  productDisplayModel,
} from "./categories";
/**
 * Intelligent Fuzzy & Token Search Engine for EL ARCA DISPLAY CLUB
 * Handles phonetic typos, brand aliases, unspaced queries ("redminote11", "sansun a03", "ipon 11", "a04e"),
 * and alphanumeric token variations with relevance scoring.
 */

export const BRAND_ALIASES: Record<string, string> = {
  // Common technician abbreviations
  rm: "redmi",
  rn: "redmi note",
  sm: "samsung",
  sam: "samsung",
  ip: "iphone",
  iph: "iphone",
  mot: "motorola",
  moto: "motorola",
  alc: "alcatel",
  inf: "infinix",
  tec: "tecno",
  tek: "tecno",
  itl: "itel",
  hw: "huawei",
  hua: "huawei",
  hon: "honor",
  pco: "poco",
  rlm: "realme",
  zt: "zte",

  // Samsung variants & typos
  sansun: "samsung",
  sansung: "samsung",
  samsun: "samsung",
  samsumg: "samsung",
  samsum: "samsung",
  samgun: "samsung",
  sammsung: "samsung",

  // iPhone / Apple typos
  ipon: "iphone",
  aifon: "iphone",
  ifon: "iphone",
  ifone: "iphone",
  iphon: "iphone",
  apple: "iphone",

  // Xiaomi / Redmi / Poco typos
  redminote: "redmi note",
  redmi: "redmi",
  xaomi: "xiaomi",
  xiami: "xiaomi",
  xiomi: "xiaomi",

  // Motorola typos
  motog: "moto g",
  motorla: "motorola",

  // Alcatel typos
  alkatel: "alcatel",
  alcater: "alcatel",

  // Tecno / Infinix / Itel typos
  tekno: "tecno",
  tecn: "tecno",
  infonix: "infinix",
  infiniks: "infinix",
  itell: "itel",

  // Huawei & Honor typos
  juawei: "huawei",
  huawuei: "huawei",
  hawei: "huawei",
  onor: "honor",

  // Realme & ZTE typos
  relme: "realme",
  ztte: "zte",
};

/** Normalize text by lowercasing, stripping diacritics/accents, and trimming */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Strips all spaces, slashes and punctuation, keeping only letters and digits */
export function compactSearchText(str: string | null | undefined): string {
  return normalizeSearchText(str).replace(/[^a-z0-9]/g, "");
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
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

type SearchableProduct = {
  categoria?: string;
  marca: string;
  modelo: string;
  calidad?: string;
  precio?: number;
  id?: string;
};
type ProductSearchIndex = {
  fingerprint: string;
  words: string[];
  modelWords: string[];
  numericWords: string[];
  compactModel: string;
  compactBrandModel: string;
  compactText: string;
  id: string;
  compactId: string;
};
const productIndexes = new WeakMap<SearchableProduct, ProductSearchIndex>();
const JOINED_ALIASES = new RegExp(
  `\\b(${Object.keys(BRAND_ALIASES)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?=[a-z]?\\d)`,
  "g",
);
const MODEL_VARIANTS = new Set([
  "pro",
  "plus",
  "max",
  "ultra",
  "lite",
  "se",
  "fe",
  "core",
  "note",
]);
const EXACT_WORDS = new Set(["con", "sin", "oled", "amoled"]);
const STOP_WORDS = new Set([
  "de",
  "del",
  "el",
  "la",
  "los",
  "las",
  "para",
  "y",
]);

function searchableWords(value: string): string[] {
  let text = normalizeSearchText(value)
    .replace(/\bc\s*\/\s*m\b|\bcm\b|\bconmarco\b/g, " con marco ")
    .replace(/\bs\s*\/\s*m\b|\bsinmarco\b/g, " sin marco ")
    .replace(/\bregion(?:es)?\b|\btablillas?\b/g, " centro carga ")
    .replace(/\bmotog(?=\d)/g, "motorola g")
    .replace(/\brm(?=\d)/g, "redmi ")
    .replace(/\brn(?=\d)/g, "redmi note ")
    .replace(/\bsm(?=\d)/g, "samsung ")
    .replace(/\bip(?=\d)/g, "iphone ")
    .replace(/\bmoto(?=\d)/g, "motorola ")
    .replace(/\bxiaomi(?=redmi|poco)/g, "xiaomi ")
    .replace(/\bredminote/g, "redmi note ")
    .replace(
      /\b(redmi|poco|iphone|samsung|motorola|moto|honor|huawei)(?=[a-z]?\d)/g,
      "$1 ",
    )
    .replace(/\b(note|galaxy|spark|hot|smart)(?=\d)/g, "$1 ");
  text = text.replace(JOINED_ALIASES, (alias) => `${BRAND_ALIASES[alias]} `);
  text = text.replace(/[a-z]+/g, (word) => BRAND_ALIASES[word] || word);
  // Fold spaced codes while keeping ordinary words and model variants separate.
  text = text
    .replace(/\b([a-z]{1,2})\s+(\d{1,4})(?:\s+([a-z])\b)?/g, "$1$2$3")
    .replace(/\b(\d{1,4})\s+([a-z])\b/g, "$1$2");
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}
let lastQuery: { raw: string; words: string[]; compact: string } | undefined;
function productQuery(query: string) {
  if (lastQuery?.raw === query) return lastQuery;
  const words = searchableWords(query).filter((word) => !STOP_WORDS.has(word));
  return (lastQuery = { raw: query, words, compact: words.join("") });
}
function indexProduct(product: SearchableProduct): ProductSearchIndex {
  const fingerprint = [
    product.categoria,
    product.marca,
    product.modelo,
    product.calidad,
    product.id,
  ].join("\u0000");
  const previous = productIndexes.get(product);
  if (previous?.fingerprint === fingerprint) return previous;
  let category = "";
  try {
    category = `${categoryLabel(product.categoria)} ${productCategory(product.categoria)}`;
  } catch {
    /* Unknown cached category cannot crash search. */
  }
  const model = productDisplayModel(product.modelo, product.categoria);
  const modelWords = searchableWords(model);
  const brandWords = searchableWords(product.marca);
  const words = searchableWords(
    `${category} ${product.marca} ${model} ${product.calidad || ""}`,
  );
  const index = {
    fingerprint,
    words,
    modelWords,
    numericWords: [...modelWords, ...brandWords],
    compactModel: modelWords.join(""),
    compactBrandModel: [...brandWords, ...modelWords].join(""),
    compactText: words.join(""),
    id: normalizeSearchText(product.id),
    compactId: compactSearchText(product.id),
  };
  productIndexes.set(product, index);
  return index;
}
function codeScore(query: string, target: string): number {
  const numbers = query.match(/\d+/g) || [];
  const targetNumbers = target.match(/\d+/g) || [];
  if (!numbers.length || numbers.length !== targetNumbers.length) return 0;
  const sameNumbers = numbers.every((number, i) => number === targetNumbers[i]);
  const typingFamily =
    /[a-z]/.test(query) &&
    numbers.length === 1 &&
    numbers[0].length === 1 &&
    target.startsWith(query);
  if (!sameNumbers && !typingFamily) return 0;
  if (query === target) return 100;
  if (/^\d+$/.test(query)) return sameNumbers ? 75 : 0;
  return target.startsWith(query) ? 80 : 0;
}
function wordScore(query: string, target: string): number {
  if (query === target) return 100;
  if (EXACT_WORDS.has(query)) return 0;
  if (target.startsWith(query)) return 80;
  if (
    /\d/.test(target) ||
    query.length < 3 ||
    target.length < 3 ||
    query.length > 64 ||
    target.length > 64
  )
    return 0;
  const distanceLimit = query.length <= 4 ? 1 : 2;
  if (Math.abs(query.length - target.length) > distanceLimit) return 0;
  const distance = levenshteinDistance(query, target);
  return distance <= distanceLimit ? 50 - distance * 10 : 0;
}

/** Read-only product search: tolerate spelling mistakes, never substitute model numbers. */
export function fuzzyMatchProduct(
  product: SearchableProduct,
  query: string,
): { match: boolean; score: number } {
  const trimmed = query.trim();
  if (!trimmed) return { match: true, score: 0 };
  if (trimmed.length > 200) return { match: false, score: 0 };
  const index = indexProduct(product);
  const raw = normalizeSearchText(trimmed);
  const compactIdQuery = compactSearchText(trimmed);
  if (
    index.id &&
    (raw === index.id ||
      (compactIdQuery.length >= 6 && compactIdQuery === index.compactId))
  )
    return { match: true, score: 2000 };
  const search = productQuery(trimmed);
  if (!search.words.length || search.words.length > 32)
    return { match: false, score: 0 };
  let total = 0;
  for (const word of search.words) {
    const candidates = MODEL_VARIANTS.has(word)
      ? index.modelWords
      : /\d/.test(word)
        ? index.numericWords
        : index.words;
    let best = 0;
    for (const target of candidates) {
      const score = MODEL_VARIANTS.has(word)
        ? word === target
          ? 100
          : 0
        : /\d/.test(word)
          ? codeScore(word, target)
          : wordScore(word, target);
      best = Math.max(best, score);
      if (best === 100) break;
    }
    if (!best) return { match: false, score: 0 };
    total += best;
  }
  const exactModel =
    search.compact === index.compactModel ||
    search.compact === index.compactBrandModel;
  const phrase = index.compactText.includes(search.compact);
  return {
    match: true,
    score:
      Math.round(total / search.words.length) +
      (exactModel ? 1000 : phrase ? 200 : 0),
  };
}

/**
 * Generic fuzzy matcher for arbitrary fields (sales history, mermas, clients, etc.)
 */
export function fuzzyMatchGeneric(
  fields: (string | number | undefined | null)[],
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const rawQ = normalizeSearchText(trimmed);
  const compQ = compactSearchText(trimmed);

  const fullText = normalizeSearchText(
    fields.filter((value) => value !== null && value !== undefined).join(" "),
  );
  const compTarget = compactSearchText(fullText);

  // Unspaced match
  if (compQ.length >= 2 && compTarget.includes(compQ)) {
    return true;
  }

  // Tokenize & expand aliases
  let expandedQuery = rawQ;
  expandedQuery = expandedQuery.replace(/\bmotog(\d+)/g, "motorola g $1");
  expandedQuery = expandedQuery.replace(/\brm(\d+)/g, "redmi $1");
  expandedQuery = expandedQuery.replace(/\brn(\d+)/g, "redmi note $1");
  expandedQuery = expandedQuery.replace(/\bsm(\d+)/g, "samsung $1");
  expandedQuery = expandedQuery.replace(/\bip(\d+)/g, "iphone $1");
  expandedQuery = expandedQuery.replace(/\bmoto(\d+)/g, "motorola $1");
  expandedQuery = expandedQuery.replace(/\bredminote/g, "redmi note ");

  for (const [alias, rep] of Object.entries(BRAND_ALIASES)) {
    const regex = new RegExp(`\\b${alias}\\b`, "g");
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
      if (
        tToken === qToken ||
        tToken.includes(qToken) ||
        qToken.includes(tToken)
      ) {
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
export function roundCupPrice(
  priceUSD: number,
  rate: number | null | undefined,
): number {
  if (!rate || !Number.isFinite(rate) || rate < 1) return NaN;
  if (!priceUSD) return 0;
  const rawCUP = priceUSD * rate;
  return Math.round(rawCUP / 100) * 100;
}
