export const CATEGORY_IDS = [
  "DISPLAY",
  "BATERIA",
  "REPUESTO",
  "ACCESORIO",
] as const;
export type ProductCategory = (typeof CATEGORY_IDS)[number];
// Historical sales and unedited products may still carry the former category.
export const STORED_CATEGORY_IDS = [...CATEGORY_IDS, "TAPA"] as const;
export const CATEGORIES: {
  id: ProductCategory;
  label: string;
  singular: string;
  description: string;
  qualities: string[];
}[] = [
  {
    id: "DISPLAY",
    label: "Pantallas",
    singular: "Pantalla",
    description: "Displays y módulos de pantalla",
    qualities: [
      "ORIGINAL C/M",
      "ORIGINAL",
      "INCELL C/M",
      "INCELL",
      "OLED",
      "AMOLED",
    ],
  },
  {
    id: "BATERIA",
    label: "Baterías",
    singular: "Batería",
    description: "Baterías para cada modelo",
    qualities: ["ORIGINAL", "COMPATIBLE", "GENÉRICA AAA"],
  },
  {
    id: "REPUESTO",
    label: "Repuestos",
    singular: "Repuestos",
    description: "Tapas, centros de carga, flex y otras piezas",
    qualities: ["ORIGINAL", "COMPATIBLE"],
  },
  {
    id: "ACCESORIO",
    label: "Accesorios y herramientas",
    singular: "Accesorios y herramientas",
    description: "Complementos y herramientas de reparación",
    qualities: ["ORIGINAL", "COMPATIBLE", "GENÉRICA"],
  },
];
/** Original and Incell omit the no-frame suffix; keep user specifications. */
export function productQuality(value: string): string {
  const quality = value.trim().toUpperCase().replace(/\s+/g, " ");
  const match = quality.match(/^(ORIGINAL|IN[\s-]?CELL)\b(.*)$/);
  if (!match) return value;
  const technology = match[1] === "ORIGINAL" ? "ORIGINAL" : "INCELL";
  const specifications = match[2]
    .replace(/\b(?:S\s*\/?\s*M|SIN\s*MARCO)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [technology, specifications].filter(Boolean).join(" ");
}
export function productCategory(value?: unknown): ProductCategory {
  if (value == null || value === "") return "DISPLAY";
  const key = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const aliases: Record<string, ProductCategory> = {
    PANTALLA: "DISPLAY",
    PANTALLAS: "DISPLAY",
    DISPLAYS: "DISPLAY",
    BATERIAS: "BATERIA",
    TAPA: "REPUESTO",
    TAPAS: "REPUESTO",
    "TAPA TRASERA": "REPUESTO",
    "TAPAS TRASERAS": "REPUESTO",
    REPUESTOS: "REPUESTO",
    PIEZA: "REPUESTO",
    PIEZAS: "REPUESTO",
    TABLILLA: "REPUESTO",
    TABLILLAS: "REPUESTO",
    REGION: "REPUESTO",
    REGIONES: "REPUESTO",
    FLEX: "REPUESTO",
    FLEXES: "REPUESTO",
    CARGA: "REPUESTO",
    "CENTRO DE CARGA": "REPUESTO",
    "CENTROS DE CARGA": "REPUESTO",
    "TABLILLA DE CARGA": "REPUESTO",
    "TABLILLAS DE CARGA": "REPUESTO",
    "PLACA DE CARGA": "REPUESTO",
    "PLACAS DE CARGA": "REPUESTO",
    ACCESORIOS: "ACCESORIO",
    HERRAMIENTA: "ACCESORIO",
    HERRAMIENTAS: "ACCESORIO",
    "ACCESORIOS Y HERRAMIENTAS": "ACCESORIO",
  };
  const category = aliases[key] || key;
  if (!(CATEGORY_IDS as readonly string[]).includes(category))
    throw new Error("Categoría inválida");
  return category as ProductCategory;
}
export const categoryLabel = (value?: unknown) =>
  CATEGORIES.find((c) => c.id === productCategory(value))!.label;
export function categoryFilter(category: unknown): Record<string, any> {
  const normalized = productCategory(category);
  if (normalized === "DISPLAY")
    return {
      $or: [
        { categoria: "DISPLAY" },
        { categoria: { $exists: false } },
        { categoria: null },
        { categoria: "" },
      ],
    };
  return normalized === "REPUESTO"
    ? { categoria: { $in: ["REPUESTO", "TAPA"] } }
    : { categoria: normalized };
}

/** This is a product name, never a hidden subtype/category. Retain what an old label told the buyer. */
export function productDisplayModel(model: string, category?: unknown): string {
  const key = String(category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const name = model.trim();
  if (/^TAPAS?(?: TRASERAS?)?$/.test(key) && !/\btapas?\b/i.test(name))
    return `TAPA TRASERA ${name}`;
  if (/^FLEX(?:ES)?$/.test(key) && !/\bflex\b/i.test(name))
    return `FLEX ${name}`;
  if (
    /^(REGION(?:ES)?|CARGA|CENTROS? DE CARGA|TABLILLAS? DE CARGA|PLACAS? DE CARGA)$/.test(
      key,
    ) &&
    !/carga|tablilla|regi[oó]n/i.test(name)
  )
    return `CENTRO DE CARGA ${name}`;
  return name;
}
export function catalogProduct<
  T extends { modelo: string; categoria?: unknown; calidad?: string },
>(product: T) {
  return {
    ...product,
    modelo: productDisplayModel(product.modelo, product.categoria),
    categoria: productCategory(product.categoria),
    ...(typeof product.calidad === "string"
      ? { calidad: productQuality(product.calidad) }
      : {}),
  };
}
/** Match exact product identity without treating an old bare-model tapa as an unrelated new part. */
export function productIdentityFilter(product: {
  marca: string;
  modelo: string;
  calidad: string;
  categoria?: unknown;
}): Record<string, any> {
  const p = catalogProduct(product);
  const normalizedQuality = productQuality(p.calidad);
  const quality =
    normalizedQuality === "ORIGINAL"
      ? /^ORIGINAL(?:\s+(?:S\s*\/?\s*M|SIN\s*MARCO))?$/i
      : normalizedQuality === "INCELL"
        ? /^IN[\s-]?CELL(?:\s+(?:S\s*\/?\s*M|SIN\s*MARCO))?$/i
        : p.calidad;
  const exact = (model: string) =>
    new RegExp("^" + model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
  if (p.categoria !== "REPUESTO")
    return {
      ...categoryFilter(p.categoria),
      marca: p.marca,
      modelo: exact(p.modelo),
      calidad: quality,
    };
  const variants: Record<string, unknown>[] = [
    { categoria: "REPUESTO", modelo: exact(p.modelo) },
  ];
  if (/^TAPA TRASERA\s+/i.test(p.modelo))
    variants.push(
      {
        categoria: "TAPA",
        modelo: exact(p.modelo.replace(/^TAPA TRASERA\s+/i, "")),
      },
      { categoria: "TAPA", modelo: exact(p.modelo) },
    );
  if (/^TAPAS?\b/i.test(p.modelo) && !/^TAPA TRASERA\s+/i.test(p.modelo))
    variants.push({ categoria: "TAPA", modelo: exact(p.modelo) });
  return { marca: p.marca, calidad: quality, $or: variants };
}
/** Free-text part words constrain search results; they do not introduce another category. */
export function partNameFilter(text: string): Record<string, any> | undefined {
  const parts: Record<string, any>[] = [];
  if (/\btapas?\b|carcasa|cubierta trasera/i.test(text))
    parts.push({
      $or: [
        { categoria: "TAPA" },
        { modelo: /tapa|carcasa|cubierta trasera/i },
      ],
    });
  if (/\bflex\b/i.test(text)) parts.push({ modelo: /\bflex\b/i });
  if (
    /centro(?:s)? de carga|tablilla|regi[oó]n(?:es)?|placa(?:s)? de carga|m[oó]dulo(?:s)? de carga|conector(?:es)? de carga/i.test(
      text,
    )
  )
    parts.push({
      $and: [
        {
          modelo:
            /(?:centro|placa|m[oó]dulo|conector).*carga|tablilla|regi[oó]n/i,
        },
        { modelo: { $not: /\bflex\b/i } },
      ],
    });
  return parts.length > 1 ? { $or: parts } : parts[0];
}
export function assertProductNumbers(price: unknown, stock: unknown) {
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 1000000
  )
    throw new Error("Precio inválido");
  if (
    typeof stock !== "number" ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 10000
  )
    throw new Error("El stock debe ser un entero entre 0 y 10.000");
}
