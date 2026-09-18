import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaMonthDay } from '@/lib/dateUtils';

/** Generates order number: MMDD + 3 random letters + product count */
function generateOrderNumber(totalItems: number): string {
  const { mm, dd } = getHavanaMonthDay();
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
  const count = String(totalItems).padStart(2, '0');
  return `${mm}${dd}${letters}${count}`;
}

/** Gemini Tool Declarations for Admin WhatsApp actions */
export const ADMIN_TOOL_DECLARATIONS = [
  {
    name: 'marcar_orden_pagada',
    description: 'Marca una orden de venta existente como PAGADA en la base de datos cuando el cliente ya saldó su deuda.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderNumber: {
          type: 'STRING',
          description: 'El código o número de orden exacto (ej: 0828QQL01, 0826IHI23)',
        },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'marcar_orden_pendiente',
    description: 'Marca una orden de venta como PENDIENTE de pago (a crédito / por cobrar).',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderNumber: {
          type: 'STRING',
          description: 'El código o número de orden exacto (ej: 0828QQL01)',
        },
      },
      required: ['orderNumber'],
    },
  },
  {
    name: 'actualizar_precio_producto',
    description: 'Modifica el precio de venta en USD de una pantalla o repuesto en el catálogo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        queryProducto: {
          type: 'STRING',
          description: 'Nombre o modelo de la pantalla a buscar (ej: Samsung A04, Redmi 9A, iPhone 11 Pro)',
        },
        nuevoPrecioUSD: {
          type: 'NUMBER',
          description: 'El nuevo precio de venta en dólares USD (número positivo)',
        },
      },
      required: ['queryProducto', 'nuevoPrecioUSD'],
    },
  },
  {
    name: 'ajustar_stock_producto',
    description: 'Agrega o descuenta unidades del stock físico de un repuesto en el almacén.',
    parameters: {
      type: 'OBJECT',
      properties: {
        queryProducto: {
          type: 'STRING',
          description: 'Nombre o modelo de la pantalla (ej: Redmi 9A, Samsung A12)',
        },
        cantidadAgregada: {
          type: 'INTEGER',
          description: 'Cantidad a sumar al stock (o restar si es negativo)',
        },
        motivo: {
          type: 'STRING',
          description: 'Motivo del ajuste (ej: Nueva compra proveedor, Ajuste físico taller)',
        },
      },
      required: ['queryProducto', 'cantidadAgregada'],
    },
  },
  {
    name: 'registrar_venta_rapida',
    description: 'Registra una nueva venta de pantallas, descuenta el stock del inventario y genera la orden en MongoDB.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cliente: {
          type: 'STRING',
          description: 'Nombre del cliente o taller (ej: Taller Habana, Ivan, Consumidor Final)',
        },
        modeloProducto: {
          type: 'STRING',
          description: 'Modelo de la pantalla vendida (ej: Samsung A12, Redmi 9A)',
        },
        cantidad: {
          type: 'INTEGER',
          description: 'Cantidad de unidades vendidas (mínimo 1)',
        },
        moneda: {
          type: 'STRING',
          enum: ['USD', 'CUP'],
          description: 'Moneda de la venta: USD o CUP (por defecto USD)',
        },
        pagado: {
          type: 'BOOLEAN',
          description: 'true si ya fue pagada en mano, false si queda pendiente por cobrar',
        },
      },
      required: ['cliente', 'modeloProducto', 'cantidad'],
    },
  },
];

/**
 * Smart product finder that matches queries like "redmi 9a", "rm 9a", "la redmi 9a", "samsung a04"
 */
export async function findProductSmart(rawQuery: string) {
  await connectToDatabase();
  let query = (rawQuery || '').trim();
  if (!query) return null;

  // 1. Clean stop words, articles, and common prefixes
  const cleanStr = query
    .toLowerCase()
    .replace(/\b(pantalla|display|de|la|el|los|las|para|un|una|modelo|repuesto)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Expand common phone abbreviations
  const expandedQuery = cleanStr
    .replace(/\brm\b/i, 'redmi')
    .replace(/\bsam\b/i, 'samsung')
    .replace(/\bip\b/i, 'iphone')
    .trim();

  // Attempt A: Exact substring match on modelo
  const escapedA = expandedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let product = await Product.findOne({
    modelo: new RegExp(escapedA, 'i'),
  });
  if (product) return product;

  // Attempt B: Match with cleanStr if different
  if (cleanStr !== expandedQuery) {
    const escapedB = cleanStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    product = await Product.findOne({
      modelo: new RegExp(escapedB, 'i'),
    });
    if (product) return product;
  }

  // Attempt C: Match all tokens (each word must appear in modelo or marca)
  const tokens = expandedQuery.split(/[\s/]+/).filter((t) => t.length > 1);
  if (tokens.length > 0) {
    const andConditions = tokens.map((token) => ({
      $or: [
        { modelo: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { marca: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ],
    }));

    product = await Product.findOne({ $and: andConditions });
    if (product) return product;
  }

  // Attempt D: ID direct match (e.g. display-049)
  product = await Product.findOne({ id: new RegExp(`^${query}$`, 'i') });
  if (product) return product;

  return null;
}

/** Tool Executor Functions */

export async function executeMarcarOrdenPagada(orderNumber: string) {
  try {
    await connectToDatabase();
    const cleanOrder = (orderNumber || '').trim().replace('#', '');
    const sale = await Sale.findOne({
      orderNumber: { $regex: new RegExp(`^${cleanOrder}$`, 'i') },
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

    sale.paid = true;
    await sale.save();

    return {
      success: true,
      message: `✅ *Orden #${sale.orderNumber} marcada como PAGADA con éxito*\n\n• Cliente: *${sale.clientName}*\n• Monto: *${sale.currency === 'CUP' ? `${sale.totalCUP?.toLocaleString()} CUP` : `$${sale.totalUSD?.toFixed(2)} USD`}*\n• Estado actual: *PAGADO* 💵`,
    };
  } catch (err: any) {
    console.error('[executeMarcarOrdenPagada error]', err);
    return {
      success: false,
      message: `❌ Error al marcar orden pagada: ${err.message || 'Error en base de datos'}`,
    };
  }
}

export async function executeMarcarOrdenPendiente(orderNumber: string) {
  try {
    await connectToDatabase();
    const cleanOrder = (orderNumber || '').trim().replace('#', '');
    const sale = await Sale.findOne({
      orderNumber: { $regex: new RegExp(`^${cleanOrder}$`, 'i') },
    });

    if (!sale) {
      return {
        success: false,
        message: `❌ No se encontró ninguna orden con el código #${cleanOrder}.`,
      };
    }

    sale.paid = false;
    await sale.save();

    return {
      success: true,
      message: `⚠️ *Orden #${sale.orderNumber} marcada como PENDIENTE de cobro*\n\n• Cliente: *${sale.clientName}*\n• Monto adeudado: *${sale.currency === 'CUP' ? `${sale.totalCUP?.toLocaleString()} CUP` : `$${sale.totalUSD?.toFixed(2)} USD`}*\n• Estado: *A Crédito / Pendiente* 📋`,
    };
  } catch (err: any) {
    console.error('[executeMarcarOrdenPendiente error]', err);
    return {
      success: false,
      message: `❌ Error al marcar orden pendiente: ${err.message || 'Error en base de datos'}`,
    };
  }
}

export async function executeActualizarPrecioProducto(queryProducto: string, nuevoPrecioUSD: number) {
  try {
    await connectToDatabase();
    if (typeof nuevoPrecioUSD !== 'number' || nuevoPrecioUSD < 0 || isNaN(nuevoPrecioUSD)) {
      return { success: false, message: '❌ El nuevo precio debe ser un número positivo válido.' };
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
      { $set: { precio: precioNuevo } }
    );

    return {
      success: true,
      message: `🏷️ *Precio Actualizado con Éxito*\n\n• Producto: *${product.marca} ${product.modelo} (${product.calidad})*\n• Precio anterior: ~$${precioAnterior.toFixed(2)} USD~\n• Nuevo precio: *$${precioNuevo.toFixed(2)} USD* 💰\n• Stock disponible: ${product.stock} uds.`,
    };
  } catch (err: any) {
    console.error('[executeActualizarPrecioProducto error]', err);
    return {
      success: false,
      message: `❌ Error al actualizar precio: ${err.message || 'Error en base de datos'}`,
    };
  }
}

export async function executeAjustarStockProducto(queryProducto: string, cantidadAgregada: number, motivo?: string) {
  try {
    await connectToDatabase();
    const qty = parseInt(String(cantidadAgregada), 10);
    if (isNaN(qty) || qty === 0) {
      return { success: false, message: '❌ La cantidad a ajustar debe ser un número entero diferente de 0.' };
    }

    const product = await findProductSmart(queryProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No se encontró ningún producto que coincida con "${queryProducto}".`,
      };
    }

    const stockBefore = product.stock || 0;
    const stockAfter = Math.max(0, stockBefore + qty);
    const isHidden = stockAfter === 0;

    // Atomic update
    await Product.updateOne(
      { _id: product._id },
      { $set: { stock: stockAfter, isHidden } }
    );

    // Log stock movement in StockHistory
    await StockHistory.create({
      productId: product.id,
      productName: `${product.marca} ${product.modelo} (${product.calidad})`,
      type: qty > 0 ? 'entrada' : 'salida',
      qty: Math.abs(qty),
      stockBefore,
      stockAfter,
      reason: motivo || `Ajuste WhatsApp por Administrador (${qty > 0 ? '+' : ''}${qty} uds)`,
    });

    return {
      success: true,
      message: `📦 *Stock Actualizado con Éxito*\n\n• Producto: *${product.marca} ${product.modelo} (${product.calidad})*\n• Ajuste: *${qty > 0 ? `+${qty}` : `${qty}`} unidades*\n• Stock anterior: ${stockBefore} uds.\n• Nuevo stock en almacén: *${stockAfter} unidades* ${stockAfter === 0 ? '⚠️ (Agotado)' : '✅'}`,
    };
  } catch (err: any) {
    console.error('[executeAjustarStockProducto error]', err);
    return {
      success: false,
      message: `❌ Error al ajustar stock: ${err.message || 'Error en base de datos'}`,
    };
  }
}

export async function executeRegistrarVentaRapida(args: {
  cliente: string;
  modeloProducto: string;
  cantidad: number;
  moneda?: 'USD' | 'CUP';
  pagado?: boolean;
}) {
  try {
    await connectToDatabase();
    const { cliente, modeloProducto, cantidad, moneda = 'USD', pagado = true } = args;

    const qty = parseInt(String(cantidad), 10);
    if (isNaN(qty) || qty < 1) {
      return { success: false, message: '❌ La cantidad de pantallas a vender debe ser al menos 1.' };
    }

    const product = await findProductSmart(modeloProducto);

    if (!product) {
      return {
        success: false,
        message: `❌ No encontré el producto "${modeloProducto}" en el catálogo para registrar la venta.`,
      };
    }

    if (product.stock < qty) {
      return {
        success: false,
        message: `⚠️ *Stock insuficiente para ${product.marca} ${product.modelo}*\n\n• Stock disponible: *${product.stock} uds*\n• Solicitado: *${qty} uds*\nNo se pudo procesar la venta.`,
      };
    }

    // Deduct stock atomically
    const stockBefore = product.stock;
    const stockAfter = stockBefore - qty;
    await Product.updateOne(
      { _id: product._id },
      { $set: { stock: stockAfter, isHidden: stockAfter <= 0 } }
    );

    // Record stock movement
    await StockHistory.create({
      productId: product.id,
      productName: `${product.marca} ${product.modelo} (${product.calidad})`,
      type: 'salida',
      qty,
      stockBefore,
      stockAfter,
      reason: `Venta WhatsApp Administrador (${cliente || 'Consumidor Final'})`,
    });

    // Calculate totals
    const subtotalUSD = parseFloat((product.precio * qty).toFixed(2));
    const rate = 300;
    const totalCUP = parseFloat((subtotalUSD * rate).toFixed(2));

    // Generate unique order number
    let orderNumber = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNumber = generateOrderNumber(qty);
      const exists = await Sale.findOne({ orderNumber });
      if (!exists) break;
    }

    const sale = await Sale.create({
      orderNumber,
      clientName: cliente || 'Consumidor Final',
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
      notes: 'Registrada vía Asistente WhatsApp Admin',
      status: 'COMPLETED',
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
        `• Total: *${moneda === 'CUP' ? `${totalCUP.toLocaleString()} CUP` : `$${subtotalUSD.toFixed(2)} USD`}*\n` +
        `• Estado: *${pagado ? 'PAGADO 💵' : 'PENDIENTE DE PAGO 📋'}*\n` +
        `• Stock restante en almacén: *${stockAfter} unidades* ${stockAfter === 0 ? '⚠️ (Agotado)' : ''}`,
    };
  } catch (err: any) {
    console.error('[executeRegistrarVentaRapida error]', err);
    return {
      success: false,
      message: `❌ Error al registrar la venta: ${err.message || 'Error en base de datos'}`,
    };
  }
}
