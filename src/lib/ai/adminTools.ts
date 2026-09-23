/**
 * src/lib/ai/adminTools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Herramientas de gestión para el Asistente IA del panel web (/admin/ia).
 * Re-usa las funciones ya probadas de whatsapp/tools.ts y agrega nuevas.
 */

import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { Sale } from '@/lib/models/Sale';
import { StockHistory } from '@/lib/models/StockHistory';
import { ExchangeRate } from '@/lib/models/ExchangeRate';
import { getHavanaMonthDay } from '@/lib/dateUtils';
import mongoose from 'mongoose';

// Re-export whatsapp tools that work with the same DB schema
export {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from '@/lib/whatsapp/tools';

// ─── Generate Order Number ────────────────────────────────────────────────────

function generateOrderNumber(totalItems: number): string {
  const { mm, dd } = getHavanaMonthDay();
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
  const count = String(totalItems).padStart(2, '0');
  return `${mm}${dd}${letters}${count}`;
}

// ─── Agregar Producto Individual (con detección de duplicados) ─────────────────

export async function executeAgregarProducto(input: {
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock?: number;
}) {
  try {
    await connectToDatabase();

    const marcaUp   = input.marca.toUpperCase().trim();
    const modeloUp  = input.modelo.toUpperCase().trim();
    const calidadUp = input.calidad.toUpperCase().trim();
    const stock     = Math.max(0, input.stock ?? 1);
    const precio    = Math.max(0, input.precio || 0);

    // ━ Check if product already exists (including hidden / agotados)
    const existing = await Product.findOne({
      marca: marcaUp,
      modelo: { $regex: new RegExp(`^${modeloUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      calidad: calidadUp,
    });

    if (existing) {
      const stockBefore = existing.stock || 0;
      const stockAfter = stockBefore + stock;
      const wasHidden = existing.isHidden || stockBefore === 0;

      existing.stock = stockAfter;
      if (precio > 0) {
        existing.precio = precio;
      }
      if (stockAfter > 0) {
        existing.isHidden = false; // Auto-unhide from agotados / ocultos!
      }
      await existing.save();

      if (stock > 0) {
        await StockHistory.create({
          productId: existing.id,
          productName: `${existing.marca} ${existing.modelo} (${existing.calidad})`,
          type: 'entrada',
          qty: stock,
          stockBefore,
          stockAfter,
          reason: 'Suma automática de stock por Asistente IA (Reingreso/Alta)',
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
          `📦 **Nuevo stock total: ${stockAfter} unidades** ${wasHidden && stockAfter > 0 ? '✨ *(Reactivado de agotados)*' : ''}\n` +
          `💰 Precio: $${existing.precio.toFixed(2)} USD\n` +
          `🆔 ID: ${existing.id}`,
      };
    }

    // ━ Generate consistent ID
    const { mm, dd } = getHavanaMonthDay();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    const customId = `${mm}${dd}-${rnd}`;

    const product = await Product.create({
      id: customId,
      marca: marcaUp,
      modelo: modeloUp,
      calidad: calidadUp,
      precio: precio,
      stock,
      isHidden: stock === 0,
    });

    if (stock > 0) {
      await StockHistory.create({
        productId: customId,
        productName: `${product.marca} ${product.modelo} (${product.calidad})`,
        type: 'entrada',
        qty: stock,
        stockBefore: 0,
        stockAfter: stock,
        reason: 'Alta inicial por Asistente IA',
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
  items: Array<{ marca: string; modelo: string; calidad: string; precio: number; stock?: number }>
) {
  try {
    await connectToDatabase();

    if (items.length === 0) {
      return { success: false, message: '❌ La lista de productos está vacía.' };
    }

    const { mm, dd } = getHavanaMonthDay();

    // ━ Scan ALL existing products (including hidden ones to reactivate them)
    const existingProducts = await Product.find({})
      .select('_id id marca modelo calidad stock precio isHidden')
      .lean() as Array<{
        _id: any;
        id: string;
        marca: string;
        modelo: string;
        calidad: string;
        stock: number;
        precio: number;
        isHidden: boolean;
      }>;

    const existingMap = new Map<string, {
      _id: any;
      id: string;
      marca: string;
      modelo: string;
      calidad: string;
      stock: number;
      precio: number;
      isHidden: boolean;
    }>();

    existingProducts.forEach((p) => {
      const k = `${(p.marca || '').toUpperCase().trim()}|${(p.modelo || '').toUpperCase().trim()}|${(p.calidad || '').toUpperCase().trim()}`;
      existingMap.set(k, p);
    });

    const toInsert: typeof items = [];
    const toIncrement: Array<{
      existingId: string;
      productMongoId: any;
      marca: string;
      modelo: string;
      calidad: string;
      stockBefore: number;
      qtyToAdd: number;
      stockAfter: number;
      newPrecio?: number;
    }> = [];

    for (const item of items) {
      const marcaUp   = (item.marca   || '').toUpperCase().trim();
      const modeloUp  = (item.modelo  || '').toUpperCase().trim();
      const calidadUp = (item.calidad || '').toUpperCase().trim();
      const qty       = Math.max(0, item.stock !== undefined ? Number(item.stock) : 1);
      const precio    = Math.max(0, Number(item.precio) || 0);

      if (!marcaUp || !modeloUp || !calidadUp) continue;

      const key = `${marcaUp}|${modeloUp}|${calidadUp}`;

      if (existingMap.has(key)) {
        const existing = existingMap.get(key)!;
        const stockBefore = existing.stock || 0;
        const stockAfter = stockBefore + qty;

        toIncrement.push({
          existingId: existing.id,
          productMongoId: existing._id,
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          stockBefore,
          qtyToAdd: qty,
          stockAfter,
          newPrecio: precio > 0 ? precio : undefined,
        });

        existing.stock = stockAfter;
        existing.isHidden = false;
      } else {
        toInsert.push({ ...item, marca: marcaUp, modelo: modeloUp, calidad: calidadUp, stock: qty, precio });
        existingMap.set(key, {
          _id: null,
          id: '',
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          stock: qty,
          precio,
          isHidden: false,
        });
      }
    }

    // ━ Execute updates for existing products (sum stock & reactivate if hidden)
    for (const inc of toIncrement) {
      const updateFields: any = {
        $inc: { stock: inc.qtyToAdd },
        $set: { isHidden: false },
      };
      if (inc.newPrecio) {
        updateFields.$set.precio = inc.newPrecio;
      }
      await Product.updateOne({ _id: inc.productMongoId }, updateFields);
    }

    if (toIncrement.length > 0) {
      const stockEntries = toIncrement
        .filter((inc) => inc.qtyToAdd > 0)
        .map((inc) => ({
          productId:   inc.existingId,
          productName: `${inc.marca} ${inc.modelo} (${inc.calidad})`,
          type:        'entrada' as const,
          qty:         inc.qtyToAdd,
          stockBefore: inc.stockBefore,
          stockAfter:  inc.stockAfter,
          reason:      inc.newPrecio
            ? `Suma de stock (+${inc.qtyToAdd} uds) y precio actualizado a $${inc.newPrecio} USD por Asistente IA`
            : 'Suma de stock en lote por Asistente IA',
        }));

      if (stockEntries.length > 0) {
        await StockHistory.insertMany(stockEntries, { ordered: false });
      }
    }

    // ━ Insert new documents
    const insertDocs = toInsert.map((item) => {
      const rnd      = Math.random().toString(36).slice(2, 6).toUpperCase();
      const customId = `${mm}${dd}-${rnd}`;
      const stock    = item.stock ?? 1;
      return {
        customId,
        productName: `${item.marca} ${item.modelo} (${item.calidad})`,
        stock,
        doc: {
          id: customId,
          marca:    item.marca,
          modelo:   item.modelo,
          calidad:  item.calidad,
          precio:   Number(item.precio) || 0,
          stock,
          isHidden: stock === 0,
        },
      };
    });

    if (insertDocs.length > 0) {
      await Product.insertMany(insertDocs.map((d) => d.doc), { ordered: false });

      const stockEntries = insertDocs
        .filter((d) => d.stock > 0)
        .map((d) => ({
          productId:   d.customId,
          productName: d.productName,
          type:        'entrada' as const,
          qty:         d.stock,
          stockBefore: 0,
          stockAfter:  d.stock,
          reason:      'Alta en lote por Asistente IA',
        }));

      if (stockEntries.length > 0) {
        await StockHistory.insertMany(stockEntries, { ordered: false });
      }
    }

    const insertedPreview = insertDocs
      .slice(0, 8)
      .map((d) => `• ${d.doc.marca} ${d.doc.modelo} ${d.doc.calidad} — $${d.doc.precio.toFixed(2)} USD — Stock: ${d.stock} uds`)
      .join('\n');
    const insertedMore = insertDocs.length > 8 ? `\n... y ${insertDocs.length - 8} más` : '';

    const incrementedPreview = toIncrement
      .slice(0, 8)
      .map((d) => `• ${d.marca} ${d.modelo} ${d.calidad} ➔ +${d.qtyToAdd} uds (Total: ${d.stockAfter} uds)${d.newPrecio ? ` — Precio: $${d.newPrecio} USD` : ''}`)
      .join('\n');
    const incrementedMore = toIncrement.length > 8 ? `\n... y ${toIncrement.length - 8} más` : '';

    let summary = `📦 **Operación en Lote Completada**\n\n`;
    if (insertDocs.length > 0) {
      summary += `✅ **${insertDocs.length} producto(s) nuevo(s) agregado(s):**\n${insertedPreview}${insertedMore}\n\n`;
    }
    if (toIncrement.length > 0) {
      summary += `🔄 **${toIncrement.length} producto(s) existente(s) actualizados (stock sumado y precio actualizado al de la lista):**\n${incrementedPreview}${incrementedMore}\n\n`;
    }

    return {
      success: true,
      message: summary.trim(),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error en alta en lote: ${msg}` };
  }
}

// ─── Alta Masiva Grande (50–500 productos) — batches de 50 con acumulación ─────

export async function executeAgregarLoteBulk(
  items: Array<{ marca: string; modelo: string; calidad: string; precio: number; stock?: number }>
) {
  try {
    await connectToDatabase();

    if (items.length === 0) {
      return { success: false, message: '❌ La lista está vacía.' };
    }
    if (items.length > 500) {
      return { success: false, message: '❌ El máximo por operación es 500 productos. Divide el lote en grupos.' };
    }

    const { mm, dd } = getHavanaMonthDay();

    // ━ Scan ALL existing products (including hidden ones)
    const existingProducts = await Product.find({})
      .select('_id id marca modelo calidad stock precio isHidden')
      .lean() as Array<{
        _id: any;
        id: string;
        marca: string;
        modelo: string;
        calidad: string;
        stock: number;
        precio: number;
        isHidden: boolean;
      }>;

    const existingMap = new Map<string, {
      _id: any;
      id: string;
      marca: string;
      modelo: string;
      calidad: string;
      stock: number;
      precio: number;
      isHidden: boolean;
    }>();

    existingProducts.forEach((p) => {
      const k = `${(p.marca || '').toUpperCase().trim()}|${(p.modelo || '').toUpperCase().trim()}|${(p.calidad || '').toUpperCase().trim()}`;
      existingMap.set(k, p);
    });

    const toInsert: typeof items = [];
    const toIncrement: Array<{
      existingId: string;
      productMongoId: any;
      marca: string;
      modelo: string;
      calidad: string;
      stockBefore: number;
      qtyToAdd: number;
      stockAfter: number;
      newPrecio?: number;
    }> = [];

    for (const item of items) {
      const marcaUp   = (item.marca   || '').toUpperCase().trim();
      const modeloUp  = (item.modelo  || '').toUpperCase().trim();
      const calidadUp = (item.calidad || '').toUpperCase().trim();
      const qty       = Math.max(0, item.stock !== undefined ? Number(item.stock) : 1);
      const precio    = Math.max(0, Number(item.precio) || 0);

      if (!marcaUp || !modeloUp || !calidadUp) continue;

      const key = `${marcaUp}|${modeloUp}|${calidadUp}`;

      if (existingMap.has(key)) {
        const existing = existingMap.get(key)!;
        const stockBefore = existing.stock || 0;
        const stockAfter = stockBefore + qty;

        toIncrement.push({
          existingId: existing.id,
          productMongoId: existing._id,
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          stockBefore,
          qtyToAdd: qty,
          stockAfter,
          newPrecio: precio > 0 ? precio : undefined,
        });

        existing.stock = stockAfter;
        existing.isHidden = false;
      } else {
        toInsert.push({ ...item, marca: marcaUp, modelo: modeloUp, calidad: calidadUp, stock: qty, precio });
        existingMap.set(key, {
          _id: null,
          id: '',
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          stock: qty,
          precio,
          isHidden: false,
        });
      }
    }

    // ━ Process increments on existing items
    for (const inc of toIncrement) {
      const updateFields: any = {
        $inc: { stock: inc.qtyToAdd },
        $set: { isHidden: false },
      };
      if (inc.newPrecio) {
        updateFields.$set.precio = inc.newPrecio;
      }
      await Product.updateOne({ _id: inc.productMongoId }, updateFields);
    }

    if (toIncrement.length > 0) {
      const stockEntries = toIncrement
        .filter((inc) => inc.qtyToAdd > 0)
        .map((inc) => ({
          productId:   inc.existingId,
          productName: `${inc.marca} ${inc.modelo} (${inc.calidad})`,
          type:        'entrada' as const,
          qty:         inc.qtyToAdd,
          stockBefore: inc.stockBefore,
          stockAfter:  inc.stockAfter,
          reason:      inc.newPrecio
            ? `Suma de stock (+${inc.qtyToAdd} uds) y precio actualizado a $${inc.newPrecio} USD (lote grande) por Asistente IA`
            : 'Suma de stock (lote grande) por Asistente IA',
        }));

      if (stockEntries.length > 0) {
        await StockHistory.insertMany(stockEntries, { ordered: false });
      }
    }

    // ━ Build and insert new items in batches of 50
    const insertDocs = toInsert.map((item) => {
      const rnd      = Math.random().toString(36).slice(2, 6).toUpperCase();
      const customId = `${mm}${dd}-${rnd}`;
      const stock    = item.stock ?? 1;
      return {
        customId,
        productName: `${item.marca} ${item.modelo} (${item.calidad})`,
        stock,
        doc: {
          id: customId,
          marca:    item.marca,
          modelo:   item.modelo,
          calidad:  item.calidad,
          precio:   Number(item.precio) || 0,
          stock,
          isHidden: stock === 0,
        },
      };
    });

    const BATCH = 50;
    let totalInserted = 0;
    let totalErrors   = 0;

    for (let i = 0; i < insertDocs.length; i += BATCH) {
      const batch = insertDocs.slice(i, i + BATCH);
      try {
        await Product.insertMany(batch.map((b) => b.doc), { ordered: false });

        const stockEntries = batch
          .filter((b) => b.stock > 0)
          .map((b) => ({
            productId:   b.customId,
            productName: b.productName,
            type:        'entrada' as const,
            qty:         b.stock,
            stockBefore: 0,
            stockAfter:  b.stock,
            reason:      'Alta masiva (lote grande) por Asistente IA',
          }));

        if (stockEntries.length > 0) {
          await StockHistory.insertMany(stockEntries, { ordered: false });
        }
        totalInserted += batch.length;
      } catch {
        totalErrors += batch.length;
      }
    }

    return {
      success: totalErrors === 0,
      message:
        `📦 **Alta masiva grande completada**\n\n` +
        `✅ ${totalInserted} producto(s) nuevo(s) insertado(s)\n` +
        (toIncrement.length > 0 ? `🔄 ${toIncrement.length} producto(s) existente(s) actualizados (stock sumado y precio actualizado al de la lista)\n` : '') +
        (totalErrors > 0        ? `❌ ${totalErrors} producto(s) con error\n` : '') +
        `\nEl catálogo ha sido actualizado en la base de datos con los nuevos precios y existencias.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error crítico en alta masiva: ${msg}` };
  }
}

// ─── Actualizar Calidad ────────────────────────────────────────────────────────

export async function executeActualizarCalidadProducto(
  queryProducto: string,
  nuevaCalidad: string
) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import('@/lib/whatsapp/tools');
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
      { $set: { calidad: nuevaCalidadUpper } }
    );

    return {
      success: true,
      message: `✅ **Calidad actualizada**\n\n📱 **${product.marca} ${product.modelo}**\n🏷️ Calidad anterior: ${calidadAnterior}\n🏷️ Calidad nueva: **${nuevaCalidadUpper}**`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al actualizar calidad: ${msg}` };
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
    const { findProductSmart } = await import('@/lib/whatsapp/tools');
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
      changes.push(`Precio: $${(product.precio as number).toFixed(2)} ➔ **$${updates.precio.toFixed(2)} USD**`);
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, message: '⚠️ No se proporcionó ningún dato para modificar.' };
    }

    await Product.updateOne({ _id: product._id }, { $set: updates });

    return {
      success: true,
      message: `✅ **Producto Modificado**\n\n📱 Original: **${product.marca} ${product.modelo} ${product.calidad}**\n\n**Cambios aplicados:**\n${changes.map((c) => `• ${c}`).join('\n')}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al modificar producto: ${msg}` };
  }
}

// ─── Ocultar Producto Individual ───────────────────────────────────────────────

export async function executeOcultarProducto(queryProducto: string) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import('@/lib/whatsapp/tools');
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
    const { findProductSmart } = await import('@/lib/whatsapp/tools');

    if (!queries || queries.length === 0) {
      return { success: false, message: '❌ No se proporcionaron productos para ocultar.' };
    }

    let successCount = 0;
    const fallidos: string[] = [];

    for (const query of queries) {
      const product = await findProductSmart(query);
      if (product) {
        await Product.updateOne({ _id: product._id }, { $set: { isHidden: true } });
        successCount++;
      } else {
        fallidos.push(query);
      }
    }

    let msg = `✅ **Lote ocultado correctamente (Deshacer ejecutado)**\n\n👁️ Se ocultaron **${successCount}** productos del catálogo.`;
    if (fallidos.length > 0) {
      msg += `\n\n⚠️ No se encontraron ${fallidos.length} productos:\n` + fallidos.slice(0, 10).map((f) => `• ${f}`).join('\n') + (fallidos.length > 10 ? `\n... y ${fallidos.length - 10} más` : '');
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

export async function getDeudores() {
  try {
    await connectToDatabase();
    const pendientes = await Sale.find({ paid: false }).sort({ createdAt: -1 }).lean();

    if (pendientes.length === 0) {
      return {
        success: true,
        message: '🎉 ¡No hay deudas pendientes! Todos los clientes están al día.',
      };
    }

    const totalDeuda = pendientes.reduce((s: number, o: { totalUSD: number }) => s + o.totalUSD, 0);
    const lista = pendientes
      .map(
        (o: { orderNumber: string; clientName: string; totalUSD: number; createdAt: Date }) =>
          `👤 **${o.clientName || 'Consumidor Final'}** (Orden: \`#${o.orderNumber}\` • ${new Date(o.createdAt).toLocaleDateString('es-ES')})\n   ↳ Adeuda: **$${o.totalUSD.toFixed(2)} USD**`
      )
      .join('\n\n');

    return {
      success: true,
      message: `📋 **Cuentas Pendientes de Cobro (${pendientes.length} órdenes)**\n\n${lista}\n\n💵 **Total Pendiente: $${totalDeuda.toFixed(2)} USD**`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error: ${msg}` };
  }
}

// ─── Ver Ventas de Hoy ─────────────────────────────────────────────────────────

export async function getVentasHoy() {
  try {
    await connectToDatabase();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const ventas = await Sale.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (ventas.length === 0) {
      return { success: true, message: '📊 No hay ventas registradas hoy.' };
    }

    const totalUSD = ventas.reduce((s: number, v: { totalUSD: number }) => s + v.totalUSD, 0);
    const pagadas = ventas.filter((v: { paid: boolean }) => v.paid).length;
    const pendientes = ventas.length - pagadas;

    const lista = ventas
      .slice(0, 10)
      .map((v: { orderNumber: string; clientName: string; totalUSD: number; paid: boolean }) =>
        `• **#${v.orderNumber}** — ${v.clientName || 'Consumidor Final'} — $${v.totalUSD.toFixed(2)} ${v.paid ? '✅' : '⏳'}`
      )
      .join('\n');

    return {
      success: true,
      message: `📊 **Ventas de Hoy (${new Date().toLocaleDateString('es-ES')})**\n\n${lista}${ventas.length > 10 ? `\n...y ${ventas.length - 10} más` : ''}\n\n💵 **Total: $${totalUSD.toFixed(2)} USD** | ✅ Pagadas: ${pagadas} | ⏳ Pendientes: ${pendientes}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error: ${msg}` };
  }
}

// ─── Catálogo para Contexto de IA ─────────────────────────────────────────────

export async function getCatalogoForContext(): Promise<string> {
  try {
    await connectToDatabase();
    const products = await Product.find({ isHidden: false })
      .select('marca modelo calidad precio stock')
      .sort({ marca: 1, modelo: 1 })
      .lean();

    if (products.length === 0) return 'El catálogo está vacío.';

    const lines = (products as Array<{ marca: string; modelo: string; calidad: string; precio: number; stock: number }>).map(
      (p) => `• ${p.marca} ${p.modelo} ${p.calidad} — $${p.precio.toFixed(2)} USD — Stock: ${p.stock}`
    );

    return `CATÁLOGO ACTUAL (${products.length} productos):\n${lines.join('\n')}`;
  } catch {
    return 'No se pudo cargar el catálogo.';
  }
}

// ─── Crear Orden Multi-Producto ───────────────────────────────────────────────

export async function executeCrearOrdenMulti(input: {
  clientName: string;
  items: Array<{ productQuery: string; qty: number; precioOverride?: number }>;
  currency?: 'USD' | 'CUP';
  paid?: boolean;
  notes?: string;
}) {
  try {
    await connectToDatabase();
    const { findProductSmart } = await import('@/lib/whatsapp/tools');

    const rateDoc = await ExchangeRate.findOne().sort({ updatedAt: -1 }).lean() as { rate: number } | null;
    if (!rateDoc || typeof rateDoc.rate !== 'number') {
      return {
        success: false,
        message: '❌ *Error Crítico:* No se ha configurado la Tasa de Cambio en el sistema. Configura la tasa primero para crear esta orden.',
      };
    }
    const exchangeRate = rateDoc.rate;

    const resolvedItems: Array<{
      productId: string;
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

    for (const item of input.items) {
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

    let orderNumber = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNumber = generateOrderNumber(totalQty);
      const exists = await Sale.findOne({ orderNumber });
      if (!exists) break;
    }

    const sale = await Sale.create({
      orderNumber,
      clientName: input.clientName || 'Consumidor Final',
      items: resolvedItems.map((i) => ({
        productId: i.productId,
        marca: i.marca,
        modelo: i.modelo,
        calidad: i.calidad,
        qty: i.qty,
        returnedQty: 0,
        precioUSD: i.precioUSD,
        subtotalUSD: i.subtotalUSD,
      })),
      currency: input.currency ?? 'USD',
      exchangeRate,
      subtotalUSD,
      totalUSD,
      totalCUP,
      paid: input.paid !== false,
      notes: input.notes ?? 'Registrada vía Asistente IA Web',
      status: 'COMPLETED',
      totalRefundedUSD: 0,
      totalRefundedCUP: 0,
      refunds: [],
    });

    // Deduct stock and log atomically
    for (const item of resolvedItems) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productMongoId, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { new: true }
      );

      // Si falló por falta de stock repentina o producto eliminado, se omite el log (o se manejaría rollback en un sistema completo)
      if (updatedProduct) {
        if (updatedProduct.stock <= 0 && !updatedProduct.isHidden) {
          await Product.updateOne({ _id: item.productMongoId }, { $set: { isHidden: true } });
        }
        
        await StockHistory.create({
          productId: item.productCustomId,
          productName: `${item.marca} ${item.modelo} (${item.calidad})`,
          type: 'salida',
          qty: item.qty,
          stockBefore: item.stockBefore,
          stockAfter: updatedProduct.stock,
          reason: `Venta Asistente IA Web — Orden #${orderNumber}`,
        });
      }
    }

    const itemsText = resolvedItems
      .map((i) => `• ${i.qty}x ${i.marca} ${i.modelo} ${i.calidad} — $${i.precioUSD.toFixed(2)} c/u`)
      .join('\n');

    return {
      success: true,
      message:
        `✅ **Orden Creada Exitosamente**\n\n` +
        `🧾 **Orden #${orderNumber}**\n` +
        `👤 Cliente: ${input.clientName || 'Consumidor Final'}\n\n` +
        `${itemsText}\n\n` +
        `💵 Total USD: $${totalUSD.toFixed(2)}\n` +
        `💴 Total CUP: $${totalCUP.toFixed(0)} (tasa: ${exchangeRate})\n` +
        `💳 Estado: ${input.paid !== false ? 'PAGADA ✅' : 'PENDIENTE ⏳'}`,
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
    const cleanOrder = (orderNumber || '').trim().replace('#', '');
    if (!cleanOrder) {
      return { success: false, message: '❌ Debes especificar el número o código de la orden que deseas anular.' };
    }

    const sale = await Sale.findOne({
      orderNumber: { $regex: new RegExp(`^${cleanOrder}$`, 'i') },
    });

    if (!sale) {
      return {
        success: false,
        message: `❌ No encontré ninguna orden con el código #${cleanOrder}. Verifica el número en el historial de ventas.`,
      };
    }

    if (sale.status === 'CANCELLED') {
      return {
        success: false,
        message: `ℹ️ La orden #${sale.orderNumber} de *${sale.clientName}* ya se encontraba ANULADA previamente.`,
      };
    }

    // Reintegrar al stock las unidades no devueltas aún
    const restoredItems: string[] = [];
    for (const item of sale.items) {
      const alreadyReturned = item.returnedQty || 0;
      const remainingToReturn = item.qty - alreadyReturned;

      if (remainingToReturn > 0) {
        const product = await Product.findOne({ id: item.productId });
        if (product) {
          const stockBefore = product.stock;
          
          const updatedProduct = await Product.findOneAndUpdate(
            { id: item.productId },
            { 
              $inc: { stock: remainingToReturn },
              $set: { isHidden: false } 
            },
            { new: true }
          );

          if (updatedProduct) {
            await StockHistory.create({
              productId: product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type: 'entrada',
              qty: remainingToReturn,
              stockBefore,
              stockAfter: updatedProduct.stock,
              reason: `Anulación Orden #${sale.orderNumber}: ${motivo || 'Cancelada vía Asistente IA'}`,
            });
            restoredItems.push(`• **${remainingToReturn}x** ${item.marca} ${item.modelo} (${item.calidad}) ➔ Stock en almacén: **${updatedProduct.stock}** uds`);
          }
        }
        item.returnedQty = item.qty;
      }
    }

    sale.status = 'CANCELLED';
    sale.notes = (sale.notes ? `${sale.notes} | ` : '') + `[ANULADA vía IA: ${motivo || 'Cancelación solicitada por Administrador'}]`;
    // BUG 4 FIX: markModified ensures Mongoose detects changes in the items subdocument array
    sale.markModified('items');
    await sale.save();

    const montoStr = sale.currency === 'CUP'
      ? `${sale.totalCUP?.toLocaleString()} CUP`
      : `$${sale.totalUSD?.toFixed(2)} USD`;

    return {
      success: true,
      message:
        `🚫 **Orden #${sale.orderNumber} ANULADA con éxito**\n\n` +
        `👤 Cliente: **${sale.clientName || 'Consumidor Final'}**\n` +
        `💰 Monto anulado: **${montoStr}**\n` +
        `📝 Motivo: ${motivo ? `*${motivo}*` : 'Cancelación solicitada por Administrador'}\n\n` +
        (restoredItems.length > 0
          ? `📦 **Stock reintegrado al almacén:**\n${restoredItems.join('\n')}`
          : '📦 No había ítems pendientes por reintegrar.'),
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
    if (isNaN(rate) || rate < 1) {
      return { success: false, message: '❌ La tasa de cambio debe ser un número positivo válido (ej: 320, 340).' };
    }

    // Obtener la tasa actual para informar el cambio
    const oldDoc = await ExchangeRate.findOne().sort({ updatedAt: -1 }).lean() as { rate: number } | null;
    const tasaAnterior = oldDoc?.rate ?? 300;

    // Singleton: Eliminar todos los registros duplicados y mantener uno solo
    await ExchangeRate.deleteMany({});
    await ExchangeRate.create({ rate });

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
    return { success: false, message: `❌ Error al actualizar tasa de cambio: ${msg}` };
  }
}

