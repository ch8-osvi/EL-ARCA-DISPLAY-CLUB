import { escapeRegex } from "@/lib/security/validation";
import { getActiveExchangeRate } from "@/lib/exchangeRate";
import connectToDatabase from "@/lib/mongoose";
import { Product } from "@/lib/models/Product";
import { Sale } from "@/lib/models/Sale";
import { StockHistory } from "@/lib/models/StockHistory";
import { getHavanaMonthDay } from "@/lib/dateUtils";
import {
  categoryFilter,
  productCategory,
  type ProductCategory,
} from "@/lib/categories";
import { detectCategoryIntent } from "./customer";

/** Generates order number: MMDD + 3 random letters + product count */
function generateOrderNumber(totalItems: number): string {
  const { mm, dd } = getHavanaMonthDay();
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  const count = String(totalItems).padStart(2, "0");
  return `${mm}${dd}${letters}${count}`;
}

/**
 * Smart product finder that matches queries like "redmi 9a", "rm 9a", "sm a32", "la redmi 9a c/m", "samsung a04"
 */
export async function findProductSmart(
  rawQuery: string,
  categoria?: ProductCategory,
) {
  await connectToDatabase();
  let query = (rawQuery || "").trim();
  if (!query) return null;

  const byId = await Product.findOne({ id: query });
  if (byId)
    return !categoria || productCategory(byId.categoria) === categoria
      ? byId
      : null;
  const selectedCategory = categoria || detectCategoryIntent(query);
  const expanded = query
    .toUpperCase()
    .replace(/\bRM\b/g, "REDMI")
    .replace(/\b(SAM|SM)\b/g, "SAMSUNG")
    .replace(/\b(IP|IPH)\b/g, "IPHONE")
    .replace(/\bMOTO\b/g, "MOTOROLA")
    .replace(
      /\b(PANTALLAS?|DISPLAYS?|BATER[IÍ]AS?|TAPAS?|TRASERAS?|ACCESORIOS?|DE|LA|EL|PARA)\b/g,
      " ",
    )
    .trim();
  const tokens = expanded.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const candidates = await Product.find({
    ...(selectedCategory ? categoryFilter(selectedCategory) : {}),
    $and: tokens.map((t) => ({
      $or: ["modelo", "marca", "calidad", "id"].map((field) => ({
        [field]: new RegExp(
          "(^|[^A-Z0-9])" + escapeRegex(t) + "($|[^A-Z0-9])",
          "i",
        ),
      })),
    })),
  }).limit(10);
  if (candidates.length > 1)
    throw new Error(
      "Producto ambiguo. Indica el ID y la calidad exactos: " +
        candidates
          .map(
            (p) =>
              p.id +
              " [" +
              productCategory(p.categoria) +
              "] " +
              p.marca +
              " " +
              p.modelo +
              " " +
              p.calidad,
          )
          .join("; "),
    );
  if (candidates.length === 1) return candidates[0];
  return null;
}

/** Tool Executor Functions */

export async function executeMarcarOrdenPagada(orderNumber: string) {
  try {
    await connectToDatabase();
    const cleanOrder = (orderNumber || "").trim().replace("#", "");
    const sale = await Sale.findOne({
      orderNumber: {
        $regex: new RegExp("^" + escapeRegex(cleanOrder) + "$", "i"),
      },
    });

    if (!sale) {
      return {
        success: false,
        message: `❌ No encontré ninguna orden con el código #${cleanOrder} en la base de datos.`,
      };
    }

    if (sale.paid) {
      return {
        success: true,
        message: `ℹ️ La orden #${sale.orderNumber} de *${sale.clientName}* ya estaba marcada como PAGADA previamente.`,
      };
    }

    if (["CANCELLED", "REFUNDED"].includes(sale.status))
      return {
        success: false,
        message:
          "La orden está anulada o devuelta; no se puede cambiar su pago.",
      };
    sale.paid = true;
    await sale.save();

    return {
      success: true,
      message: `✅ *Orden #${sale.orderNumber} marcada como PAGADA con éxito*\n\n• Cliente: *${sale.clientName}*\n• Monto: *${sale.currency === "CUP" ? `${sale.totalCUP?.toLocaleString()} CUP` : `$${sale.totalUSD?.toFixed(2)} USD`}*\n• Estado actual: *PAGADO* 💵`,
    };
  } catch (err: any) {
    console.error("[executeMarcarOrdenPagada error]", err);
    return {
      success: false,
      message: `❌ Error al marcar orden pagada: ${err.message || "Error en base de datos"}`,
    };
  }
}

export async function executeMarcarOrdenPendiente(orderNumber: string) {
  try {
    await connectToDatabase();
    const cleanOrder = (orderNumber || "").trim().replace("#", "");
    const sale = await Sale.findOne({
      orderNumber: {
        $regex: new RegExp("^" + escapeRegex(cleanOrder) + "$", "i"),
      },
    });

    if (!sale) {
      return {
        success: false,
        message: `❌ No se encontró ninguna orden con el código #${cleanOrder}.`,
      };
    }

    if (["CANCELLED", "REFUNDED"].includes(sale.status))
      return {
        success: false,
        message:
          "La orden está anulada o devuelta; no se puede cambiar su pago.",
      };
    sale.paid = false;
    await sale.save();

    return {
      success: true,
      message: `⚠️ *Orden #${sale.orderNumber} marcada como PENDIENTE de cobro*\n\n• Cliente: *${sale.clientName}*\n• Monto adeudado: *${sale.currency === "CUP" ? `${sale.totalCUP?.toLocaleString()} CUP` : `$${sale.totalUSD?.toFixed(2)} USD`}*\n• Estado: *A Crédito / Pendiente* 📋`,
    };
  } catch (err: any) {
    console.error("[executeMarcarOrdenPendiente error]", err);
    return {
      success: false,
      message: `❌ Error al marcar orden pendiente: ${err.message || "Error en base de datos"}`,
    };
  }
}

export async function executeActualizarPrecioProducto(
  queryProducto: string,
  nuevoPrecioUSD: number,
) {
  try {
    await connectToDatabase();
    if (
      typeof nuevoPrecioUSD !== "number" ||
      nuevoPrecioUSD < 0 ||
      isNaN(nuevoPrecioUSD)
    ) {
      return {
        success: false,
        message: "❌ El nuevo precio debe ser un número positivo válido.",
      };
    }

    const product = await findProductSmart(queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré ningún producto que coincida con "${queryProducto}". Verifica el nombre del modelo.`,
      };
    }

    const precioAnterior = product.precio;
    const precioNuevo = parseFloat(nuevoPrecioUSD.toFixed(2));

    // Atomic update to guarantee zero schema validation collisions
    await Product.updateOne(
      { _id: product._id },
      { $set: { precio: precioNuevo } },
    );

    return {
      success: true,
      message: `🏷️ *Precio Actualizado con Éxito*\n\n• Producto: *${product.marca} ${product.modelo} (${product.calidad})*\n• Precio anterior: ~$${precioAnterior.toFixed(2)} USD~\n• Nuevo precio: *$${precioNuevo.toFixed(2)} USD* 💰\n• Stock disponible: ${product.stock} uds.`,
    };
  } catch (err: any) {
    console.error("[executeActualizarPrecioProducto error]", err);
    return {
      success: false,
      message: `❌ Error al actualizar precio: ${err.message || "Error en base de datos"}`,
    };
  }
}

export async function executeAjustarStockProducto(
  queryProducto: string,
  cantidadAgregada: number,
  motivo?: string,
) {
  try {
    await connectToDatabase();
    const qty = Number(cantidadAgregada);
    if (!Number.isSafeInteger(qty) || qty === 0 || Math.abs(qty) > 10000) {
      return {
        success: false,
        message:
          "❌ La cantidad a ajustar debe ser un número entero diferente de 0.",
      };
    }

    const product = await findProductSmart(queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No se encontró ningún producto que coincida con "${queryProducto}".`,
      };
    }

    // Atomic update
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: product._id, ...(qty < 0 ? { stock: { $gte: -qty } } : {}) },
      { $inc: { stock: qty } },
      { returnDocument: "after" },
    );

    if (!updatedProduct) {
      return {
        success: false,
        message:
          "❌ Error al actualizar el stock (producto no encontrado durante la operación).",
      };
    }

    const stockBefore = product.stock || 0;
    const stockAfter = updatedProduct.stock;

    // Log stock movement in StockHistory
    await StockHistory.create({
      productId: product.id,
      productName: `${product.marca} ${product.modelo} (${product.calidad})`,
      type: qty > 0 ? "entrada" : "salida",
      qty: Math.abs(qty),
      stockBefore,
      stockAfter,
      reason:
        motivo ||
        `Ajuste WhatsApp por Administrador (${qty > 0 ? "+" : ""}${qty} uds)`,
    });

    return {
      success: true,
      message: `📦 *Stock Actualizado con Éxito*\n\n• Producto: *${product.marca} ${product.modelo} (${product.calidad})*\n• Ajuste: *${qty > 0 ? `+${qty}` : `${qty}`} unidades*\n• Stock anterior: ${stockBefore} uds.\n• Nuevo stock en almacén: *${stockAfter} unidades* ${stockAfter === 0 ? "⚠️ (Agotado)" : "✅"}`,
    };
  } catch (err: any) {
    console.error("[executeAjustarStockProducto error]", err);
    return {
      success: false,
      message: `❌ Error al ajustar stock: ${err.message || "Error en base de datos"}`,
    };
  }
}

export async function executeRegistrarVentaRapida(args: {
  cliente: string;
  modeloProducto: string;
  cantidad: number;
  moneda?: "USD" | "CUP";
  pagado?: boolean;
}) {
  try {
    await connectToDatabase();
    const {
      cliente,
      modeloProducto,
      cantidad,
      moneda = "USD",
      pagado = true,
    } = args;

    const qty = Number(cantidad);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10000) {
      return {
        success: false,
        message: "❌ La cantidad de pantallas a vender debe ser al menos 1.",
      };
    }

    const product = await findProductSmart(modeloProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré el producto "${modeloProducto}" en el catálogo para registrar la venta.`,
      };
    }

    // Verify exchange rate first before mutating DB
    const rateDoc = (await getActiveExchangeRate()) as { rate: number } | null;
    if (!rateDoc || typeof rateDoc.rate !== "number") {
      return {
        success: false,
        message:
          "❌ *Error Crítico:* No se ha configurado la Tasa de Cambio en el sistema. Configura la tasa primero.",
      };
    }
    const rate = rateDoc.rate;

    if (product.stock < qty) {
      return {
        success: false,
        message: `⚠️ *Stock insuficiente para ${product.marca} ${product.modelo}*\n\n• Stock disponible: *${product.stock} uds*\n• Solicitado: *${qty} uds*\nNo se pudo procesar la venta.`,
      };
    }

    // Deduct stock atomically with $inc to prevent concurrent race conditions
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { returnDocument: "after" },
    );

    if (!updatedProduct) {
      return {
        success: false,
        message: `⚠️ *Conflicto de Inventario para ${product.marca} ${product.modelo}*\n\nOtra operación se procesó al mismo tiempo y ya no queda stock suficiente.`,
      };
    }

    const stockBefore = product.stock;
    const stockAfter = updatedProduct.stock;

    // Record stock movement
    await StockHistory.create({
      productId: product.id,
      productName: `${product.marca} ${product.modelo} (${product.calidad})`,
      type: "salida",
      qty,
      stockBefore,
      stockAfter,
      reason: `Venta WhatsApp Administrador (${cliente || "Consumidor Final"})`,
    });

    // Calculate totals
    const subtotalUSD = parseFloat((product.precio * qty).toFixed(2));
    const totalCUP = parseFloat((subtotalUSD * rate).toFixed(2));

    // Generate unique order number
    let orderNumber = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNumber = generateOrderNumber(qty);
      const exists = await Sale.findOne({ orderNumber });
      if (!exists) break;
    }

    const sale = await Sale.create({
      orderNumber,
      clientName: cliente || "Consumidor Final",
      items: [
        {
          productId: product.id,
          marca: product.marca,
          modelo: product.modelo,
          calidad: product.calidad,
          qty,
          returnedQty: 0,
          precioUSD: product.precio,
          subtotalUSD,
        },
      ],
      currency: moneda,
      exchangeRate: rate,
      subtotalUSD,
      totalUSD: subtotalUSD,
      totalCUP,
      paid: pagado,
      notes: "Registrada vía Asistente WhatsApp Admin",
      status: "COMPLETED",
      totalRefundedUSD: 0,
      totalRefundedCUP: 0,
      refunds: [],
    });

    return {
      success: true,
      message:
        `🧾 *Venta Registrada con Éxito #${sale.orderNumber}*\n\n` +
        `• Cliente: *${sale.clientName}*\n` +
        `• Artículo: *${qty}x ${product.marca} ${product.modelo} (${product.calidad})*\n` +
        `• Total: *${moneda === "CUP" ? `${totalCUP.toLocaleString()} CUP` : `$${subtotalUSD.toFixed(2)} USD`}*\n` +
        `• Estado: *${pagado ? "PAGADO 💵" : "PENDIENTE DE PAGO 📋"}*\n` +
        `• Stock restante en almacén: *${stockAfter} unidades* ${stockAfter === 0 ? "⚠️ (Agotado)" : ""}`,
    };
  } catch (err: any) {
    console.error("[executeRegistrarVentaRapida error]", err);
    return {
      success: false,
      message: `❌ Error al registrar la venta: ${err.message || "Error en base de datos"}`,
    };
  }
}
