import { productCategory, categoryFilter } from "@/lib/categories";
import { escapeRegex } from "@/lib/security/validation";
import {
  getActiveExchangeRate,
  saveActiveExchangeRate,
  validExchangeRate,
} from "@/lib/exchangeRate";
/**
 * src/lib/ai/adminTools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Herramientas de gestión para el Asistente IA del panel web (/admin/ia).
 * Re-usa las funciones ya probadas de whatsapp/tools.ts y agrega nuevas.
 */

import connectToDatabase from "@/lib/mongoose";
import { Product } from "@/lib/models/Product";
import { Sale } from "@/lib/models/Sale";
import { StockHistory } from "@/lib/models/StockHistory";
import { getHavanaMonthDay } from "@/lib/dateUtils";
import mongoose from "mongoose";
import { cleanModelAndQuality } from "@/lib/ai/batchParser";
import { findProductSmart } from "@/lib/whatsapp/tools";

// Re-export whatsapp tools that work with the same DB schema
export {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from "@/lib/whatsapp/tools";

// ─── Generate Order Number ────────────────────────────────────────────────────

function generateOrderNumber(totalItems: number): string {
  const { mm, dd } = getHavanaMonthDay();
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  const count = String(totalItems).padStart(2, "0");
  return `${mm}${dd}${letters}${count}`;
}

// ─── Agregar Producto Individual (con detección de duplicados) ─────────────────

export async function executeAgregarProducto(input: {
  categoria?: string;
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock?: number;
}) {
  try {
    await connectToDatabase();

    const categoria = productCategory(input.categoria);
    const marcaUp = input.marca.toUpperCase().trim();
    const { modelo: modeloClean, calidad: calidadClean } =
      categoria === "DISPLAY"
        ? cleanModelAndQuality(input.modelo, input.calidad)
        : {
            modelo: input.modelo.trim().toUpperCase(),
            calidad: input.calidad.trim().toUpperCase(),
          };
    const modeloUp = modeloClean;
    const calidadUp = calidadClean;
    const stock = input.stock ?? 1;
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 10000 ||
      !Number.isFinite(input.precio) ||
      input.precio < 0
    )
      return { success: false, message: "Stock o precio inválido" };
    const precio = Math.max(0, input.precio || 0);

    // ━ Check if product already exists (including hidden / agotados)
    const existing = await Product.findOne({
      ...categoryFilter(categoria),
      marca: marcaUp,
      modelo: {
        $regex: new RegExp(
          `^${modeloUp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
      calidad: calidadUp,
    });

    if (existing) {
      const stockBefore = existing.stock || 0;
      const stockAfter = stockBefore + stock;
      const wasHidden = existing.isHidden;

      existing.stock = stockAfter;
      if (precio > 0) {
        existing.precio = precio;
      }

      await existing.save();

      if (stock > 0) {
        await StockHistory.create({
          productId: existing.id,
          productName: `${existing.marca} ${existing.modelo} (${existing.calidad})`,
          type: "entrada",
          qty: stock,
          stockBefore,
          stockAfter,
          reason: "Suma automática de stock por Asistente IA (Reingreso/Alta)",
        });
      }

      return {
        success: true,
        isExistingUpdated: true,
        message:
          `🔄 **Producto existente reconocido — Stock incrementado**\n\n` +
          `📱 **${existing.marca} ${existing.modelo} ${existing.calidad}**\n` +
          `📦 Stock anterior: ${stockBefore} uds\n` +
          `➕ Unidades sumadas: +${stock} uds\n` +
          `📦 **Nuevo stock total: ${stockAfter} unidades** ${wasHidden ? "*(Conserva su visibilidad oculta)*" : ""}\n` +
          `💰 Precio: $${existing.precio.toFixed(2)} USD\n` +
          `🆔 ID: ${existing.id}`,
      };
    }

    // ━ Generate consistent ID
    const { mm, dd } = getHavanaMonthDay();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    const customId = `${mm}${dd}-${rnd}`;

    const product = await Product.create({
      categoria,
      id: customId,
      marca: marcaUp,
      modelo: modeloUp,
      calidad: calidadUp,
      precio: precio,
      stock,
      isHidden: false,
    });

    if (stock > 0) {
      await StockHistory.create({
        productId: customId,
        productName: `${product.marca} ${product.modelo} (${product.calidad})`,
        type: "entrada",
        qty: stock,
        stockBefore: 0,
        stockAfter: stock,
        reason: "Alta inicial por Asistente IA",
      });
    }

    return {
      success: true,
      message:
        `✅ **Producto agregado al catálogo**\n\n` +
        `📱 **${product.marca} ${product.modelo} ${product.calidad}**\n` +
        `💰 Precio: $${precio.toFixed(2)} USD\n` +
        `📦 Stock inicial: ${stock} unidades\n` +
        `🆔 ID: ${customId}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al agregar producto: ${msg}` };
  }
}

// ─── Alta en Lote (hasta ~50 productos) — con acumulación de stock y reactivación ───

export async function executeAgregarProductosLote(
  items: Array<{
    categoria?: string;
    marca: string;
    modelo: string;
    calidad: string;
    precio: number;
    stock?: number;
  }>,
) {
  if (!items.length || items.length > 500)
    return {
      success: false,
      message: "El lote debe contener entre 1 y 500 productos.",
    };
  const consolidated = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const clean =
      productCategory(item.categoria) === "DISPLAY"
        ? cleanModelAndQuality(item.modelo, item.calidad)
        : {
            modelo: item.modelo.trim().toUpperCase(),
            calidad: item.calidad.trim().toUpperCase(),
          };
    const normalized = {
      ...item,
      categoria: productCategory(item.categoria),
      marca: item.marca.toUpperCase().trim(),
      ...clean,
      stock: item.stock ?? 1,
    };
    if (
      !Number.isSafeInteger(normalized.stock) ||
      normalized.stock < 0 ||
      normalized.stock > 10000 ||
      !Number.isFinite(item.precio) ||
      item.precio < 0
    )
      return {
        success: false,
        message: "Cantidad o precio inválido en el lote.",
      };
    const key =
      normalized.categoria +
      "|" +
      normalized.marca +
      "|" +
      normalized.modelo +
      "|" +
      normalized.calidad;
    const previous = consolidated.get(key);
    if (previous && previous.precio !== normalized.precio)
      return {
        success: false,
        message:
          "El lote repite un producto con precios diferentes. Corrige la lista.",
      };
    consolidated.set(key, {
      ...normalized,
      stock: (previous?.stock ?? 0) + normalized.stock,
    });
  }
  const results: string[] = [];
  for (const item of consolidated.values()) {
    const result = await executeAgregarProducto(item);
    if (!result.success) throw new Error(result.message);
    results.push(result.message);
  }
  return {
    success: true,
    message:
      "Lote confirmado: " +
      consolidated.size +
      " productos procesados.\n\n" +
      results.slice(0, 15).join("\n\n") +
      (results.length > 15
        ? "\nConsulta el inventario para ver el resto."
        : ""),
  };
}
export const executeAgregarLoteBulk = executeAgregarProductosLote;

export async function executeActualizarCalidadProducto(
  queryProducto: string,
  nuevaCalidad: string,
) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import("@/lib/whatsapp/tools");
    const product = await findProductSmart(queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré ningún producto que coincida con "${queryProducto}".`,
      };
    }

    const calidadAnterior = product.calidad;
    const nuevaCalidadUpper = nuevaCalidad.toUpperCase().trim();

    await Product.updateOne(
      { _id: product._id },
      { $set: { calidad: nuevaCalidadUpper } },
    );

    return {
      success: true,
      message: `✅ **Calidad actualizada**\n\n📱 **${product.marca} ${product.modelo}**\n🏷️ Calidad anterior: ${calidadAnterior}\n🏷️ Calidad nueva: **${nuevaCalidadUpper}**`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Error al actualizar calidad: ${msg}`,
    };
  }
}

// ─── Modificar Producto General (Corrección) ───────────────────────────────────

export async function executeModificarProducto(input: {
  queryProducto: string;
  nuevaMarca?: string;
  nuevoModelo?: string;
  nuevaCalidad?: string;
  nuevoPrecio?: number;
}) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import("@/lib/whatsapp/tools");
    const product = await findProductSmart(input.queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré ningún producto que coincida con "${input.queryProducto}".`,
      };
    }

    const updates: Record<string, any> = {};
    const changes: string[] = [];

    if (input.nuevaMarca) {
      updates.marca = input.nuevaMarca.toUpperCase().trim();
      changes.push(`Marca: ${product.marca} ➔ **${updates.marca}**`);
    }
    if (input.nuevoModelo) {
      updates.modelo = input.nuevoModelo.toUpperCase().trim();
      changes.push(`Modelo: ${product.modelo} ➔ **${updates.modelo}**`);
    }
    if (input.nuevaCalidad) {
      updates.calidad = input.nuevaCalidad.toUpperCase().trim();
      changes.push(`Calidad: ${product.calidad} ➔ **${updates.calidad}**`);
    }
    if (input.nuevoPrecio !== undefined && input.nuevoPrecio >= 0) {
      updates.precio = input.nuevoPrecio;
      changes.push(
        `Precio: $${(product.precio as number).toFixed(2)} ➔ **$${updates.precio.toFixed(2)} USD**`,
      );
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: "⚠️ No se proporcionó ningún dato para modificar.",
      };
    }

    await Product.updateOne({ _id: product._id }, { $set: updates });

    return {
      success: true,
      message: `✅ **Producto Modificado**\n\n📱 Original: **${product.marca} ${product.modelo} ${product.calidad}**\n\n**Cambios aplicados:**\n${changes.map((c) => `• ${c}`).join("\n")}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Error al modificar producto: ${msg}`,
    };
  }
}

// ─── Ocultar Producto Individual ───────────────────────────────────────────────

export async function executeOcultarProducto(queryProducto: string) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import("@/lib/whatsapp/tools");
    const product = await findProductSmart(queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré ningún producto que coincida con "${queryProducto}".`,
      };
    }

    await Product.updateOne({ _id: product._id }, { $set: { isHidden: true } });

    return {
      success: true,
      message: `✅ **Producto ocultado del catálogo**\n\n📱 **${product.marca} ${product.modelo} ${product.calidad}**\n👁️ Ya no aparecerá en el catálogo público.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error: ${msg}` };
  }
}

// ─── Ocultar Lote de Productos (Undo Masivo) ──────────────────────────────────

export async function executeOcultarLote(queries: string[]) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import("@/lib/whatsapp/tools");

    if (!queries || queries.length === 0) {
      return {
        success: false,
        message: "❌ No se proporcionaron productos para ocultar.",
      };
    }

    let successCount = 0;
    const fallidos: string[] = [];

    for (const query of queries) {
      const product = await findProductSmart(query);
      if (product) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { isHidden: true } },
        );
        successCount++;
      } else {
        throw new Error("Producto no encontrado: " + query);
      }
    }

    let msg = `✅ **Lote ocultado correctamente (Deshacer ejecutado)**\n\n👁️ Se ocultaron **${successCount}** productos del catálogo.`;
    if (fallidos.length > 0) {
      msg +=
        `\n\n⚠️ No se encontraron ${fallidos.length} productos:\n` +
        fallidos
          .slice(0, 10)
          .map((f) => `• ${f}`)
          .join("\n") +
        (fallidos.length > 10 ? `\n... y ${fallidos.length - 10} más` : "");
    }

    return {
      success: true,
      message: msg,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al ocultar lote: ${msg}` };
  }
}

// ─── Ver Deudores ─────────────────────────────────────────────────────────────

export async function executeCrearOrdenMulti(input: {
  clientName: string;
  items: Array<{ productQuery: string; qty: number; precioOverride?: number }>;
  currency?: "USD" | "CUP";
  paid?: boolean;
  notes?: string;
}) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import("@/lib/whatsapp/tools");

    const rateDoc = (await getActiveExchangeRate()) as { rate: number } | null;
    if (!rateDoc || typeof rateDoc.rate !== "number") {
      return {
        success: false,
        message:
          "❌ *Error Crítico:* No se ha configurado la Tasa de Cambio en el sistema. Configura la tasa primero para crear esta orden.",
      };
    }
    const exchangeRate = rateDoc.rate;

    const resolvedItems: Array<{
      productId: string;
      categoria?: string;
      marca: string;
      modelo: string;
      calidad: string;
      qty: number;
      precioUSD: number;
      subtotalUSD: number;
      returnedQty: number;
      stockBefore: number;
      productMongoId: mongoose.Types.ObjectId;
      productCustomId: string;
    }> = [];

    if (!input.items.length || input.items.length > 100)
      return {
        success: false,
        message: "La orden debe tener entre 1 y 100 artículos.",
      };
    for (const item of input.items) {
      if (
        !Number.isSafeInteger(item.qty) ||
        item.qty < 1 ||
        item.qty > 10000 ||
        (item.precioOverride != null &&
          (!Number.isFinite(item.precioOverride) || item.precioOverride < 0))
      )
        return {
          success: false,
          message: "Cantidad o precio inválido en la orden.",
        };
      const product = await findProductSmart(item.productQuery);
      if (!product) {
        return {
          success: false,
          message: `❌ No encontré el producto: "${item.productQuery}". Verifica el nombre o agrégalo primero.`,
        };
      }
      if (product.stock < item.qty) {
        return {
          success: false,
          message: `❌ Stock insuficiente para "${product.modelo} ${product.calidad}". Disponible: ${product.stock}, solicitado: ${item.qty}.`,
        };
      }
      const precioUSD = item.precioOverride ?? product.precio;
      resolvedItems.push({
        productId: product.id,
        marca: product.marca,
        modelo: product.modelo,
        calidad: product.calidad,
        categoria: productCategory(product.categoria),
        qty: item.qty,
        precioUSD,
        subtotalUSD: precioUSD * item.qty,
        returnedQty: 0,
        stockBefore: product.stock,
        productMongoId: product._id as mongoose.Types.ObjectId,
        productCustomId: product.id,
      });
    }

    const subtotalUSD = resolvedItems.reduce((s, i) => s + i.subtotalUSD, 0);
    const totalUSD = subtotalUSD;
    const totalCUP = totalUSD * exchangeRate;
    const totalQty = resolvedItems.reduce((s, i) => s + i.qty, 0);

    let orderNumber = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNumber = generateOrderNumber(totalQty);
      const exists = await Sale.findOne({ orderNumber });
      if (!exists) break;
    }

    const sale = await Sale.create({
      orderNumber,
      clientName: input.clientName || "Consumidor Final",
      items: resolvedItems.map((i) => ({
        productId: i.productId,
        marca: i.marca,
        modelo: i.modelo,
        calidad: i.calidad,
        categoria: productCategory(i.categoria),
        qty: i.qty,
        returnedQty: 0,
        precioUSD: i.precioUSD,
        subtotalUSD: i.subtotalUSD,
      })),
      currency: input.currency ?? "USD",
      exchangeRate,
      subtotalUSD,
      totalUSD,
      totalCUP,
      paid: input.paid !== false,
      notes: input.notes ?? "Registrada vía Asistente IA Web",
      status: "COMPLETED",
      totalRefundedUSD: 0,
      totalRefundedCUP: 0,
      refunds: [],
    });

    // Deduct stock and log atomically
    for (const item of resolvedItems) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productMongoId, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { returnDocument: "after" },
      );

      // Si falló por falta de stock repentina o producto eliminado, se omite el log (o se manejaría rollback en un sistema completo)
      if (!updatedProduct)
        throw new Error(
          "El stock cambió mientras se creaba la orden. No se guardó la operación.",
        );
      if (updatedProduct) {
        await StockHistory.create({
          productId: item.productCustomId,
          productName: `${item.marca} ${item.modelo} (${item.calidad})`,
          type: "salida",
          qty: item.qty,
          stockBefore: item.stockBefore,
          stockAfter: updatedProduct.stock,
          reason: `Venta Asistente IA Web — Orden #${orderNumber}`,
        });
      }
    }

    const itemsText = resolvedItems
      .map(
        (i) =>
          `• ${i.qty}x ${i.marca} ${i.modelo} ${i.calidad} — $${i.precioUSD.toFixed(2)} c/u`,
      )
      .join("\n");

    return {
      success: true,
      message:
        `✅ **Orden Creada Exitosamente**\n\n` +
        `🧾 **Orden #${orderNumber}**\n` +
        `👤 Cliente: ${input.clientName || "Consumidor Final"}\n\n` +
        `${itemsText}\n\n` +
        `💵 Total USD: $${totalUSD.toFixed(2)}\n` +
        `💴 Total CUP: $${totalCUP.toFixed(0)} (tasa: ${exchangeRate})\n` +
        `💳 Estado: ${input.paid !== false ? "PAGADA ✅" : "PENDIENTE ⏳"}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al crear orden: ${msg}` };
  }
}

// ─── Anular Orden con Reintegro de Stock ──────────────────────────────────────

export async function executeAnularOrden(orderNumber: string, motivo?: string) {
  try {
    await connectToDatabase();
    const cleanOrder = (orderNumber || "").trim().replace("#", "");
    if (!cleanOrder) {
      return {
        success: false,
        message:
          "❌ Debes especificar el número o código de la orden que deseas anular.",
      };
    }

    const sale = await Sale.findOne({
      orderNumber: {
        $regex: new RegExp("^" + escapeRegex(cleanOrder) + "$", "i"),
      },
    });

    if (!sale) {
      return {
        success: false,
        message: `❌ No encontré ninguna orden con el código #${cleanOrder}. Verifica el número en el historial de ventas.`,
      };
    }

    if (sale.status === "CANCELLED") {
      return {
        success: false,
        message: `ℹ️ La orden #${sale.orderNumber} de *${sale.clientName}* ya se encontraba ANULADA previamente.`,
      };
    }

    // Reintegrar al stock las unidades no devueltas aún
    const restoredItems: string[] = [];
    const retiredItems: string[] = [];
    for (const item of sale.items) {
      const alreadyReturned = item.returnedQty || 0;
      const remainingToReturn = item.qty - alreadyReturned;

      if (remainingToReturn > 0) {
        const product = await Product.findOne({ id: item.productId });
        if (!product) {
          await StockHistory.create({
            productId: item.productId,
            productName: `[${productCategory(item.categoria)}] ${item.marca} ${item.modelo} (${item.calidad})`,
            type: "retirado",
            qty: remainingToReturn,
            stockBefore: 0,
            stockAfter: 0,
            reason: `Anulación Orden #${sale.orderNumber}: ${motivo || "Cancelación solicitada"} [Producto eliminado; unidades fuera del inventario]`,
          });
          retiredItems.push(
            `${remainingToReturn}x ${item.marca} ${item.modelo}`,
          );
          item.returnedQty = item.qty;
          continue;
        }
        if (product) {
          const stockBefore = product.stock;

          const updatedProduct = await Product.findOneAndUpdate(
            { id: item.productId },
            {
              $inc: { stock: remainingToReturn },
            },
            { returnDocument: "after" },
          );

          if (updatedProduct) {
            await StockHistory.create({
              productId: product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type: "entrada",
              qty: remainingToReturn,
              stockBefore,
              stockAfter: updatedProduct.stock,
              reason: `Anulación Orden #${sale.orderNumber}: ${motivo || "Cancelada vía Asistente IA"}`,
            });
            restoredItems.push(
              `• **${remainingToReturn}x** ${item.marca} ${item.modelo} (${item.calidad}) ➔ Stock en almacén: **${updatedProduct.stock}** uds`,
            );
          }
        }
        item.returnedQty = item.qty;
      }
    }

    sale.status = "CANCELLED";
    sale.notes =
      (sale.notes ? `${sale.notes} | ` : "") +
      `[ANULADA vía IA: ${motivo || "Cancelación solicitada por Administrador"}]`;
    // BUG 4 FIX: markModified ensures Mongoose detects changes in the items subdocument array
    sale.markModified("items");
    await sale.save();

    const montoStr =
      sale.currency === "CUP"
        ? `${sale.totalCUP?.toLocaleString()} CUP`
        : `$${sale.totalUSD?.toFixed(2)} USD`;

    return {
      success: true,
      message:
        `🚫 **Orden #${sale.orderNumber} ANULADA con éxito**\n\n` +
        `👤 Cliente: **${sale.clientName || "Consumidor Final"}**\n` +
        `💰 Monto anulado: **${montoStr}**\n` +
        `📝 Motivo: ${motivo ? `*${motivo}*` : "Cancelación solicitada por Administrador"}\n\n` +
        (restoredItems.length > 0
          ? `📦 **Stock reintegrado al almacén:**\n${restoredItems.join("\n")}`
          : retiredItems.length
            ? ""
            : "📦 No había ítems pendientes por reintegrar.") +
        (retiredItems.length
          ? `\n\nFuera de inventario (productos eliminados): ${retiredItems.join("; ")}. No se recrearon productos ni se repuso su stock.`
          : ""),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al anular orden: ${msg}` };
  }
}

// ─── Actualizar Tasa de Cambio USD a CUP ──────────────────────────────────────

export async function executeActualizarTasaCambio(nuevaTasa: number) {
  try {
    await connectToDatabase();
    const rate = parseFloat(String(nuevaTasa));
    if (!validExchangeRate(rate)) {
      return {
        success: false,
        message:
          "❌ La tasa de cambio debe ser un número positivo válido (ej: 320, 340).",
      };
    }

    // Obtener la tasa actual para informar el cambio
    const oldDoc = (await getActiveExchangeRate()) as { rate: number } | null;
    const tasaAnterior = oldDoc?.rate ?? "Sin configurar";

    // Actualizar atómicamente la tasa activa compartida
    await saveActiveExchangeRate(rate);

    return {
      success: true,
      message:
        `💱 **Tasa de Cambio Actualizada con Éxito**\n\n` +
        `• Tasa anterior: 1 USD = **${tasaAnterior} CUP**\n` +
        `• Nueva tasa oficial: **1 USD = ${rate} CUP** 💵\n\n` +
        `El sistema calculará automáticamente las nuevas ventas y equivalencias usando esta tasa.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Error al actualizar tasa de cambio: ${msg}`,
    };
  }
}

// ─── Fusionar Productos Duplicados ──────────────────────────────────────────

export async function executeFusionarProductos(params: {
  queryPrincipal: string;
  querySecundario: string;
  nuevoModelo?: string;
  nuevoPrecio?: number;
}) {
  try {
    await connectToDatabase();
    const q1 = params.queryPrincipal.trim();
    const q2 = params.querySecundario.trim();

    const primary = await findProductSmart(q1);

    if (!primary) {
      return {
        success: false,
        message: `❌ No se encontró el producto principal con "${q1}"`,
      };
    }

    const secondary = await findProductSmart(q2);
    if (primary?.id === secondary?.id)
      return { success: false, message: "Selecciona dos productos distintos" };

    if (!secondary) {
      return {
        success: false,
        message: `❌ No se encontró el producto secundario con "${q2}"`,
      };
    }

    if (
      productCategory(primary.categoria) !==
        productCategory(secondary.categoria) ||
      primary.marca !== secondary.marca ||
      primary.calidad !== secondary.calidad
    )
      return {
        success: false,
        message:
          "No se pueden fusionar categorías, marcas o calidades diferentes.",
      };
    const { calculateDuplicateScore } = await import("@/lib/duplicateDetector");
    if (calculateDuplicateScore(primary as any, secondary as any).score < 95)
      return {
        success: false,
        message:
          "La equivalencia no es inequívoca. Revisa las variantes en el gestor de productos.",
      };
    const stockBefore = primary.stock || 0;
    const stockSec = secondary.stock || 0;
    const combinedStock = stockBefore + stockSec;

    const finalModelo = (params.nuevoModelo || primary.modelo)
      .toUpperCase()
      .trim();
    const finalPrecio =
      params.nuevoPrecio !== undefined && params.nuevoPrecio >= 0
        ? params.nuevoPrecio
        : primary.precio;

    primary.modelo = finalModelo;
    primary.precio = finalPrecio;
    primary.stock = combinedStock;

    await primary.save();

    // Migrar StockHistory
    await StockHistory.updateMany(
      { productId: secondary.id },
      {
        $set: {
          productId: primary.id,
          productName: `${primary.marca} ${finalModelo} (${primary.calidad})`,
        },
      },
    );

    // Migrar Sale items
    await Sale.updateMany(
      { "items.productId": secondary.id },
      { $set: { "items.$[elem].productId": primary.id } },
      { arrayFilters: [{ "elem.productId": secondary.id }] },
    );

    // Registrar nuevo historial
    if (stockSec > 0)
      await StockHistory.create({
        productId: primary.id,
        productName: `${primary.marca} ${finalModelo} (${primary.calidad})`,
        type: "entrada",
        qty: stockSec,
        stockBefore,
        stockAfter: combinedStock,
        reason: `Fusión de inventario por Asistente IA: se integraron +${stockSec} uds de "${secondary.modelo}" en "${finalModelo}". Precio: $${finalPrecio} USD`,
      });

    // Eliminar secundario
    await Product.deleteOne({ _id: secondary._id });

    return {
      success: true,
      message:
        `🔀 **Fusión de Productos Completada con Éxito**\n\n` +
        `• **Producto Resultante:** ${primary.marca} ${finalModelo} (${primary.calidad})\n` +
        `• **Stock Combinado:** ${stockBefore} uds + ${stockSec} uds = **${combinedStock} unidades**\n` +
        `• **Precio Oficial:** $${finalPrecio} USD\n` +
        `• **Producto Integrado:** "${secondary.modelo}" (${secondary.id}) eliminado y su historial unificado.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Error al fusionar productos: ${msg}`,
    };
  }
}

// ─── Normalizar Catálogo Existente (Saneamiento de Modelo y Calidad) ──────────

export async function executeNormalizarCatalogoExistente() {
  try {
    await connectToDatabase();

    const candidates = await Product.find({
      $or: [
        { modelo: /\((INCELL|ORIGINAL|OLED|AMOLED|AAA|COMPATIBLE)\)/i },
        { modelo: /\b(INCELL|ORIGINAL|OLED|AMOLED)\b/i },
        { calidad: "C/M" },
        { calidad: "S/M" },
      ],
    });

    let modifiedCount = 0;
    let mergedCount = 0;
    const logs: string[] = [];

    for (const prod of candidates) {
      if (productCategory(prod.categoria) !== "DISPLAY") continue;
      const { modelo: cleanMod, calidad: cleanCal } = cleanModelAndQuality(
        prod.modelo,
        prod.calidad,
      );
      if (cleanMod === prod.modelo && cleanCal === prod.calidad) continue;

      // Verificar si ya existe otro registro con ese modelo y calidad limpios
      const existing = await Product.findOne({
        _id: { $ne: prod._id },
        ...categoryFilter(productCategory(prod.categoria)),
        marca: prod.marca,
        modelo: {
          $regex: new RegExp(
            `^${cleanMod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
        calidad: cleanCal,
      });

      if (existing) {
        // Fusionar con el existente
        const stockToAdd = prod.stock || 0;
        existing.stock = (existing.stock || 0) + stockToAdd;
        if (prod.precio > 0 && prod.precio !== existing.precio) {
          existing.precio = prod.precio;
        }
        // Preserve deliberate catalog visibility.
        await existing.save();

        // Migrar StockHistory
        await StockHistory.updateMany(
          { productId: prod.id },
          {
            $set: {
              productId: existing.id,
              productName: `${existing.marca} ${cleanMod} (${cleanCal})`,
            },
          },
        );

        // Migrar Sale items
        await Sale.updateMany(
          { "items.productId": prod.id },
          { $set: { "items.$[elem].productId": existing.id } },
          { arrayFilters: [{ "elem.productId": prod.id }] },
        );

        if (stockToAdd > 0) {
          await StockHistory.create({
            productId: existing.id,
            productName: `${existing.marca} ${cleanMod} (${cleanCal})`,
            type: "entrada",
            qty: stockToAdd,
            stockBefore: existing.stock - stockToAdd,
            stockAfter: existing.stock,
            reason: `Fusión automática por normalización de calidad: se unificó "${prod.modelo}" en "${cleanMod}"`,
          });
        }

        // Eliminar producto viciado
        await Product.deleteOne({ _id: prod._id });
        mergedCount++;
        logs.push(
          `• Fusionado "${prod.modelo}" en "${cleanMod}" (${cleanCal}) ➔ Stock: ${existing.stock} uds`,
        );
      } else {
        // Actualizar registro en su lugar
        const oldName = `${prod.modelo} [${prod.calidad}]`;
        prod.modelo = cleanMod;
        prod.calidad = cleanCal;
        await prod.save();

        // Actualizar nombres en historiales si aplica
        await StockHistory.updateMany(
          { productId: prod.id },
          { $set: { productName: `${prod.marca} ${cleanMod} (${cleanCal})` } },
        );

        modifiedCount++;
        logs.push(`• Saneado "${oldName}" ➔ "${cleanMod}" (${cleanCal})`);
      }
    }

    return {
      success: true,
      modifiedCount,
      mergedCount,
      message:
        `🧹 **Normalización de Catálogo Ejecutada con Éxito**\n\n` +
        `✅ **${modifiedCount} repuesto(s) corregidos** (calidad y modelo limpiados)\n` +
        `🔀 **${mergedCount} repuesto(s) duplicados fusionados** a sus registros oficiales con stock sumado\n\n` +
        (logs.length > 0
          ? logs.slice(0, 15).join("\n")
          : "El catálogo ya se encontraba 100% normalizado."),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `❌ Error al normalizar catálogo: ${msg}`,
    };
  }
}
