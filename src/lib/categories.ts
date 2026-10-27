export const CATEGORY_IDS = [
  "DISPLAY",
  "BATERIA",
  "TAPA",
  "ACCESORIO",
] as const;
export type ProductCategory = (typeof CATEGORY_IDS)[number];
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
      "ORIGINAL S/M",
      "INCELL C/M",
      "INCELL S/M",
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
    id: "TAPA",
    label: "Tapas traseras",
    singular: "Tapa trasera",
    description: "Tapas y cubiertas de repuesto",
    qualities: ["ORIGINAL", "COMPATIBLE"],
  },
  {
    id: "ACCESORIO",
    label: "Accesorios",
    singular: "Accesorio",
    description: "Accesorios y complementos",
    qualities: ["ORIGINAL", "COMPATIBLE", "GENÉRICA"],
  },
];
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
    TAPAS: "TAPA",
    "TAPA TRASERA": "TAPA",
    "TAPAS TRASERAS": "TAPA",
    ACCESORIOS: "ACCESORIO",
  };
  const category = aliases[key] || key;
  if (!(CATEGORY_IDS as readonly string[]).includes(category))
    throw new Error("Categoría inválida");
  return category as ProductCategory;
}
export const categoryLabel = (value?: unknown) =>
  CATEGORIES.find((c) => c.id === productCategory(value))!.label;
export const categoryFilter = (
  category: ProductCategory,
): Record<string, any> =>
  category === "DISPLAY"
    ? {
        $or: [
          { categoria: "DISPLAY" },
          { categoria: { $exists: false } },
          { categoria: null },
          { categoria: "" },
        ],
      }
    : { categoria: category };
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
