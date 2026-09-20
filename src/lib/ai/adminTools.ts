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

// ─── Agregar Producto Individual ──────────────────────────────────────────────

export async function executeAgregarProducto(input: {
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock?: number;
}) {
  try {
    await connectToDatabase();

    const stock = input.stock ?? 0;
    const { mm, dd } = getHavanaMonthDay();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    const customId = `${mm}${dd}-${rnd}`;

    const product = await Product.create({
      id: customId,
      marca: input.marca.toUpperCase().trim(),
      modelo: input.modelo.trim(),
      calidad: input.calidad.toUpperCase().trim(),
      precio: input.precio,
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
      message: `✅ **Producto agregado al catálogo**\n\n📱 **${product.marca} ${product.modelo} ${product.calidad}**\n💰 Precio: $${input.precio.toFixed(2)} USD\n📦 Stock inicial: ${stock} unidades\n🆔 ID: ${customId}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `❌ Error al agregar producto: ${msg}` };
  }
}

// ─── Alta Masiva de Productos ─────────────────────────────────────────────────

export async function executeAgregarProductosLote(
  items: Array<{ marca: string; modelo: string; calidad: string; precio: number; stock?: number }>
) {
  const results: string[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const item of items) {
    const result = await executeAgregarProducto(item);
    if (result.success) {
      successCount++;
      results.push(`✅ ${item.marca} ${item.modelo} ${item.calidad} — $${item.precio} USD`);
    } else {
      errorCount++;
      results.push(`❌ ${item.marca} ${item.modelo}: ${result.message}`);
    }
  }

  return {
    success: errorCount === 0,
    message: `📦 **Alta masiva completada**\n\n✅ ${successCount} productos agregados${errorCount > 0 ? `\n❌ ${errorCount} errores` : ''}\n\n${results.join('\n')}`,
  };
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

// ─── Ocultar Producto ─────────────────────────────────────────────────────────

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
    const exchangeRate = rateDoc?.rate ?? 300;

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

    // Deduct stock and log
    for (const item of resolvedItems) {
      const stockAfter = Math.max(0, item.stockBefore - item.qty);
      await Product.updateOne(
        { _id: item.productMongoId },
        { $set: { stock: stockAfter, isHidden: stockAfter <= 0 } }
      );
      await StockHistory.create({
        productId: item.productCustomId,
        productName: `${item.marca} ${item.modelo} (${item.calidad})`,
        type: 'salida',
        qty: item.qty,
        stockBefore: item.stockBefore,
        stockAfter,
        reason: `Venta Asistente IA Web — Orden #${orderNumber}`,
      });
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
