export type Action = { type: string; payload: Record<string, any> };
type Field = {
  type: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  items?: object;
  properties?: object;
  required?: string[];
};
const str = (description: string): Field => ({ type: "string", description });
const num = (minimum = 0): Field => ({
  type: "number",
  minimum,
  maximum: 1000000,
});
const qty: Field = { type: "integer", minimum: 0, maximum: 10000 };
const product = {
  marca: str("Marca exacta"),
  modelo: str("Modelo exacto"),
  calidad: str("Calidad y marco explícitos"),
  precio: num(),
  stock: qty,
};
const item = {
  type: "object",
  properties: {
    productQuery: str("ID exacto del catálogo"),
    qty: { ...qty, minimum: 1 },
    precioOverride: num(),
  },
  required: ["productQuery", "qty"],
  additionalProperties: false,
};
export const actionSchemas: Record<
  string,
  { properties: Record<string, Field>; required: string[] }
> = {
  CREAR_ORDEN: {
    properties: {
      clientName: str("Cliente"),
      items: { type: "array", items: item },
      currency: { type: "string", enum: ["USD", "CUP"] },
      paid: { type: "boolean" },
      notes: str("Nota"),
    },
    required: ["clientName", "items", "currency", "paid"],
  },
  VENTA_RAPIDA: {
    properties: {
      cliente: str("Cliente"),
      modeloProducto: str("ID exacto"),
      cantidad: { ...qty, minimum: 1 },
      moneda: { type: "string", enum: ["USD", "CUP"] },
      pagado: { type: "boolean" },
    },
    required: ["cliente", "modeloProducto", "cantidad", "moneda", "pagado"],
  },
  ACTUALIZAR_PRECIO: {
    properties: { queryProducto: str("ID exacto"), nuevoPrecioUSD: num() },
    required: ["queryProducto", "nuevoPrecioUSD"],
  },
  ACTUALIZAR_CALIDAD: {
    properties: {
      queryProducto: str("ID exacto"),
      nuevaCalidad: str("Calidad completa"),
    },
    required: ["queryProducto", "nuevaCalidad"],
  },
  AJUSTAR_STOCK: {
    properties: {
      queryProducto: str("ID exacto"),
      cantidadAgregada: { ...qty, minimum: -10000 },
      motivo: str("Motivo"),
    },
    required: ["queryProducto", "cantidadAgregada", "motivo"],
  },
  MARCAR_PAGADA: {
    properties: { orderNumber: str("Código exacto") },
    required: ["orderNumber"],
  },
  MARCAR_PENDIENTE: {
    properties: { orderNumber: str("Código exacto") },
    required: ["orderNumber"],
  },
  ANULAR_ORDEN: {
    properties: { orderNumber: str("Código exacto"), motivo: str("Motivo") },
    required: ["orderNumber", "motivo"],
  },
  ACTUALIZAR_TASA_CAMBIO: {
    properties: { nuevaTasa: { ...num(1) } },
    required: ["nuevaTasa"],
  },
  AGREGAR_PRODUCTO: { properties: product, required: Object.keys(product) },
  AGREGAR_LOTE: {
    properties: {
      productos: {
        type: "array",
        items: {
          type: "object",
          properties: product,
          required: Object.keys(product),
          additionalProperties: false,
        },
      },
    },
    required: ["productos"],
  },
  OCULTAR_PRODUCTO: {
    properties: { queryProducto: str("ID exacto") },
    required: ["queryProducto"],
  },
  OCULTAR_LOTE: {
    properties: { queries: { type: "array", items: { type: "string" } } },
    required: ["queries"],
  },
  MODIFICAR_PRODUCTO: {
    properties: {
      queryProducto: str("ID exacto"),
      nuevaMarca: str("Marca"),
      nuevoModelo: str("Modelo"),
      nuevaCalidad: str("Calidad"),
      nuevoPrecio: num(),
    },
    required: ["queryProducto"],
  },
  FUSIONAR_PRODUCTOS: {
    properties: {
      queryPrincipal: str("ID exacto principal"),
      querySecundario: str("ID exacto secundario"),
      nuevoModelo: str("Modelo verificado"),
      nuevoPrecio: num(),
    },
    required: ["queryPrincipal", "querySecundario"],
  },
};
function validate(value: any, field: any, path: string): void {
  if (field.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(path + ": objeto requerido");
    for (const k of field.required || [])
      if (value[k] === undefined) throw new Error(path + ": falta " + k);
    for (const k of Object.keys(value)) {
      if (!field.properties[k])
        throw new Error(path + ": campo desconocido " + k);
      validate(value[k], field.properties[k], path + "." + k);
    }
  } else if (field.type === "array") {
    if (!Array.isArray(value) || !value.length || value.length > 500)
      throw new Error(path + ": lista inválida");
    value.forEach((v: any, i: number) =>
      validate(v, field.items, path + "[" + i + "]"),
    );
  } else if (field.type === "string") {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 1000 ||
      (field.enum && !field.enum.includes(value))
    )
      throw new Error(path + ": texto inválido");
  } else if (field.type === "boolean") {
    if (typeof value !== "boolean")
      throw new Error(path + ": booleano requerido");
  } else if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (field.type === "integer" && !Number.isSafeInteger(value)) ||
    value < field.minimum ||
    value > field.maximum
  )
    throw new Error(path + ": número inválido");
}
export function validateActions(actions: Action[]) {
  if (!Array.isArray(actions) || !actions.length || actions.length > 10)
    throw new Error("Máximo 10 acciones por confirmación");
  for (const action of actions) {
    const schema = actionSchemas[action.type];
    if (!schema) throw new Error("Acción no permitida");
    validate(action.payload, { type: "object", ...schema }, action.type);
    if (
      action.type === "AJUSTAR_STOCK" &&
      action.payload.cantidadAgregada === 0
    )
      throw new Error("El ajuste no puede ser cero");
    const products =
      action.type === "AGREGAR_LOTE"
        ? action.payload.productos
        : action.type === "AGREGAR_PRODUCTO"
          ? [action.payload]
          : [];
    for (const product of products)
      if (/SIN ESPECIFICAR/i.test(product.calidad))
        throw new Error(
          "Indica tecnología/calidad y marco de cada producto; no se asume ORIGINAL C/M.",
        );
  }
  return actions;
}
export const functionDeclarations = Object.entries(actionSchemas).map(
  ([name, schema]) => ({
    name,
    description:
      "Proponer " +
      name +
      ". El servidor exige confirmación antes de ejecutar.",
    parametersJsonSchema: {
      type: "object",
      ...schema,
      additionalProperties: false,
    },
  }),
);
