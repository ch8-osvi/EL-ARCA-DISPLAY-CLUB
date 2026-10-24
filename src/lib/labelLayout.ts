/**
 * Etiquetador de cajas — lógica pura (sin React, sin red, sin base de datos).
 *
 * IMPORTANTE: nada en este módulo modifica inventario ni stock. Solo calcula
 * distribución en hoja A4, valida cantidades y combina líneas repetidas.
 */

// ---------------------------------------------------------------------------
// Constantes físicas (milímetros)
// ---------------------------------------------------------------------------

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** Zona no imprimible típica de impresoras domésticas: no permitir menos. */
export const MIN_MARGIN_MM = 5;
export const MAX_MARGIN_MM = 30;
export const MIN_GAP_MM = 0;
export const MAX_GAP_MM = 20;
export const MIN_LABEL_CM = 1.5;

export const DEFAULT_SETTINGS: LabelSettings = {
  widthCm: 8,
  heightCm: 8,
  marginMm: 8,
  gapMm: 4,
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface LabelSettings {
  widthCm: number;
  heightCm: number;
  marginMm: number;
  gapMm: number;
}

/** Instantánea mínima del producto (para mostrar líneas aunque el inventario cambie). */
export interface LabelProductSnapshot {
  marca: string;
  modelo: string;
  calidad: string;
}

export interface LabelLine {
  /** id local de la línea (no es el id del producto) */
  uid: string;
  productId: string;
  snapshot: LabelProductSnapshot;
  /** Texto tal como lo escribe el usuario; se valida antes de imprimir. */
  qty: string;
}

export interface BoxLabelDraft {
  uid: string;
  /** Nota opcional (p. ej. "Estante A"). */
  note: string;
  lines: LabelLine[];
}

export interface LabelDraft {
  version: 1;
  settings: LabelSettings;
  boxes: BoxLabelDraft[];
}

export interface GridLayout {
  ok: boolean;
  error?: string;
  labelWidthMm: number;
  labelHeightMm: number;
  cols: number;
  rows: number;
  perPage: number;
  /** Desplazamiento desde el borde de la hoja (grilla centrada). */
  offsetXMm: number;
  offsetYMm: number;
  gapMm: number;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const createUid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Redondeo a 0,1 mm para evitar errores de coma flotante (8.0000001 cm, etc.). */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Parsea una cantidad escrita por el usuario. Devuelve el entero si es válido
 * (entero estrictamente mayor que 0) o null si no lo es.
 * Rechaza: "", "0", "-1", "2.5", "2,5", "1e2", "abc", " 3a".
 */
export function parseQty(raw: string): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function productLabel(s: LabelProductSnapshot): string {
  return [s.marca, s.modelo].filter(Boolean).join(' ').trim();
}

// ---------------------------------------------------------------------------
// Distribución A4
// ---------------------------------------------------------------------------

/**
 * Calcula cuántas etiquetas caben en una hoja A4 vertical.
 *   cols = floor((210 − 2·margen + sep) / (ancho + sep))
 *   rows = floor((297 − 2·margen + sep) / (alto  + sep))
 * La grilla resultante se centra en la hoja (sobrante repartido a ambos lados).
 */
export function computeGrid(settings: LabelSettings): GridLayout {
  const w = round1(settings.widthCm * 10);
  const h = round1(settings.heightCm * 10);
  const margin = settings.marginMm;
  const gap = settings.gapMm;

  const base: GridLayout = {
    ok: false,
    labelWidthMm: w,
    labelHeightMm: h,
    cols: 0,
    rows: 0,
    perPage: 0,
    offsetXMm: margin,
    offsetYMm: margin,
    gapMm: gap,
  };

  const invalid = [w, h, margin, gap].some((v) => !Number.isFinite(v));
  if (invalid) return { ...base, error: 'Revisa las medidas: hay valores vacíos o no numéricos.' };
  if (w < MIN_LABEL_CM * 10 || h < MIN_LABEL_CM * 10)
    return { ...base, error: `El tamaño mínimo de etiqueta es ${MIN_LABEL_CM} × ${MIN_LABEL_CM} cm.` };
  if (margin < MIN_MARGIN_MM || margin > MAX_MARGIN_MM)
    return { ...base, error: `El margen debe estar entre ${MIN_MARGIN_MM} y ${MAX_MARGIN_MM} mm.` };
  if (gap < MIN_GAP_MM || gap > MAX_GAP_MM)
    return { ...base, error: `La separación debe estar entre ${MIN_GAP_MM} y ${MAX_GAP_MM} mm.` };

  const usableW = A4_WIDTH_MM - 2 * margin;
  const usableH = A4_HEIGHT_MM - 2 * margin;
  // Pequeña tolerancia (0,01 mm) para casos exactos como 2 × 95 mm en 190 mm.
  const cols = Math.floor((usableW + gap + 0.01) / (w + gap));
  const rows = Math.floor((usableH + gap + 0.01) / (h + gap));

  if (cols < 1 || rows < 1) {
    const maxW = (usableW / 10).toFixed(1);
    const maxH = (usableH / 10).toFixed(1);
    return {
      ...base,
      cols: Math.max(cols, 0),
      rows: Math.max(rows, 0),
      error: `La etiqueta no cabe en A4 con margen de ${margin} mm. Máximo: ${maxW} × ${maxH} cm.`,
    };
  }

  const gridW = cols * w + (cols - 1) * gap;
  const gridH = rows * h + (rows - 1) * gap;

  return {
    ...base,
    ok: true,
    cols,
    rows,
    perPage: cols * rows,
    offsetXMm: round1((A4_WIDTH_MM - gridW) / 2),
    offsetYMm: round1((A4_HEIGHT_MM - gridH) / 2),
  };
}

/** Divide las cajas en páginas según la capacidad por hoja. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage <= 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

// ---------------------------------------------------------------------------
// Tipografía de la etiqueta
// ---------------------------------------------------------------------------

export const PT_TO_MM = 0.3528;
export const MIN_LINE_FONT_PT = 6.5;
export const MAX_LINE_FONT_PT = 13;

export interface LabelTypography {
  paddingMm: number;
  brandPt: number;
  boxPt: number;
  notePt: number;
  linePt: number;
  qualityPt: number;
  qtyPt: number;
  totalPt: number;
  /** true si incluso con la fuente mínima las líneas no caben (estimación). */
  likelyOverflow: boolean;
}

/**
 * Elige tamaños de fuente legibles en función del tamaño físico y del número
 * de líneas. La detección real de desbordamiento se hace además midiendo el
 * DOM en la vista previa; esta función solo da una buena estimación inicial.
 */
export function computeTypography(
  widthMm: number,
  heightMm: number,
  lineCount: number,
  hasNote: boolean
): LabelTypography {
  const minSide = Math.min(widthMm, heightMm);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const paddingMm = clamp(minSide * 0.045, 2, 4);
  const brandPt = clamp(minSide * 0.075, 5, 7.5);
  const boxPt = clamp(minSide * 0.2, 10, 22);
  const notePt = clamp(minSide * 0.1, 6.5, 9);
  const totalPt = clamp(minSide * 0.13, 8, 13);

  // Altura reservada (mm): cabecera (marca + "CAJA N") + nota + pie (TOTAL) + separadores.
  const headerMm = (brandPt + boxPt) * PT_TO_MM * 1.15 + 1.5;
  const noteMm = hasNote ? notePt * PT_TO_MM * 1.25 + 0.8 : 0;
  const footerMm = totalPt * PT_TO_MM * 1.2 + 2.5;
  const available = heightMm - 2 * paddingMm - headerMm - noteMm - footerMm;

  const n = Math.max(lineCount, 1);
  // Cada línea ≈ nombre (1 renglón) + calidad (0,78) con interlineado 1,15 + 0,8 mm de separación.
  const perLineFactor = PT_TO_MM * 1.15 * (1 + 0.78);
  const ideal = (available / n - 0.8) / perLineFactor;
  const widthCap = clamp(widthMm * 0.16, MIN_LINE_FONT_PT, MAX_LINE_FONT_PT);
  const linePt = clamp(ideal, MIN_LINE_FONT_PT, Math.min(MAX_LINE_FONT_PT, widthCap));

  return {
    paddingMm,
    brandPt,
    boxPt,
    notePt,
    linePt,
    qualityPt: Math.max(linePt * 0.78, 5.5),
    qtyPt: Math.min(linePt * 1.35, 18),
    totalPt,
    likelyOverflow: ideal < MIN_LINE_FONT_PT,
  };
}

// ---------------------------------------------------------------------------
// Líneas, totales y validación
// ---------------------------------------------------------------------------

/**
 * Añade un producto a la lista de líneas de una caja. Si ese producto ya está,
 * suma la cantidad en la línea existente (no se duplican líneas).
 */
export function addOrMergeLine(
  lines: LabelLine[],
  productId: string,
  snapshot: LabelProductSnapshot,
  qty: number
): { lines: LabelLine[]; merged: boolean } {
  const idx = lines.findIndex((l) => l.productId === productId);
  if (idx === -1) {
    return {
      lines: [...lines, { uid: createUid(), productId, snapshot, qty: String(qty) }],
      merged: false,
    };
  }
  const current = parseQty(lines[idx].qty) ?? 0;
  const next = [...lines];
  next[idx] = { ...next[idx], snapshot, qty: String(current + qty) };
  return { lines: next, merged: true };
}

export function boxTotal(box: BoxLabelDraft): number {
  return box.lines.reduce((sum, l) => sum + (parseQty(l.qty) ?? 0), 0);
}

/** Suma por producto en todas las cajas (para avisar si supera el stock registrado). */
export function totalsByProduct(boxes: BoxLabelDraft[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of boxes)
    for (const l of b.lines) {
      const q = parseQty(l.qty);
      if (q) map.set(l.productId, (map.get(l.productId) ?? 0) + q);
    }
  return map;
}

export interface BoxIssues {
  errors: string[];
  /** uid de línea → mensaje de error */
  lineErrors: Record<string, string>;
}

export function validateBox(box: BoxLabelDraft, knownProductIds: Set<string> | null): BoxIssues {
  const errors: string[] = [];
  const lineErrors: Record<string, string> = {};

  if (box.lines.length === 0) errors.push('La caja no tiene modelos. Añade al menos uno.');

  for (const l of box.lines) {
    if (!l.productId) lineErrors[l.uid] = 'Falta seleccionar el modelo.';
    else if (knownProductIds && !knownProductIds.has(l.productId))
      lineErrors[l.uid] = 'Este producto ya no existe en el inventario. Quítalo o reemplázalo.';
    else if (parseQty(l.qty) === null)
      lineErrors[l.uid] = 'La cantidad debe ser un número entero mayor que 0.';
  }

  return { errors, lineErrors };
}
