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

/** Tool Executor Functions */

export async function executeMarcarOrdenPagada(orderNumber: string) {
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
}

export async function executeMarcarOrdenPendiente(orderNumber: string) {
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
}

export async function executeActualizarPrecioProducto(queryProducto: string, nuevoPrecioUSD: number) {
  await connectToDatabase();
  if (typeof nuevoPrecioUSD !== 'number' || nuevoPrecioUSD < 0 || isNaN(nuevoPrecioUSD)) {
    return { success: false, message: '❌ El nuevo precio debe ser un número positivo válido.' };
  }

  const cleanQuery = (queryProducto || '').trim();
  const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const product = await Product.findOne({
    $or: [{ modelo: regex }, { id: regex }, { marca: regex }],
  });

  if (!product) {
    return {
      success: false,
      message: `❌ No encontré ningún producto que coincida con "${cleanQuery}".`,
    };
  }

  const precioAnterior = product.precio;
  product.precio = parseFloat(nuevoPrecioUSD.toFixed(2));
  await product.save();

  return {
    success: true,
    message: `🏷️ *Precio Actualizado con Éxito*\n\n• Producto: *${product.marca} ${product.modelo} (${product.calidad})*\n• Precio anterior: ~$${precioAnterior.toFixed(2)} USD~\n• Nuevo precio: *$${product.precio.toFixed(2)} USD* 💰\n• Stock disponible: ${product.stock} uds.`,
  };
}

export async function executeAjustarStockProducto(queryProducto: string, cantidadAgregada: number, motivo?: string) {
  await connectToDatabase();
  const qty = parseInt(String(cantidadAgregada), 10);
  if (isNaN(qty) || qty === 0) {
    return { success: false, message: '❌ La cantidad a ajustar debe ser un número entero diferente de 0.' };
  }

  const cleanQuery = (queryProducto || '').trim();
  const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const product = await Product.findOne({
    $or: [{ modelo: regex }, { id: regex }],
  });

  if (!product) {
    return {
      success: false,
      message: `❌ No se encontró ningún producto que coincida con "${cleanQuery}".`,
    };
  }

  const stockBefore = product.stock || 0;
  const stockAfter = Math.max(0, stockBefore + qty);

  product.stock = stockAfter;
  if (stockAfter > 0) {
    product.isHidden = false;
  } else {
    product.isHidden = true;
  }
  await product.save();

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
}

export async function executeRegistrarVentaRapida(args: {
  cliente: string;
  modeloProducto: string;
  cantidad: number;
  moneda?: 'USD' | 'CUP';
  pagado?: boolean;
}) {
  await connectToDatabase();
  const { cliente, modeloProducto, cantidad, moneda = 'USD', pagado = true } = args;

  const qty = parseInt(String(cantidad), 10);
  if (isNaN(qty) || qty < 1) {
    return { success: false, message: '❌ La cantidad de pantallas a vender debe ser al menos 1.' };
  }

  const cleanQuery = (modeloProducto || '').trim();
  const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const product = await Product.findOne({
    $or: [{ modelo: regex }, { id: regex }],
  });

  if (!product) {
    return {
      success: false,
      message: `❌ No encontré el producto "${cleanQuery}" en el catálogo para registrar la venta.`,
    };
  }

  if (product.stock < qty) {
    return {
      success: false,
      message: `⚠️ *Stock insuficiente para ${product.marca} ${product.modelo}*\n\n• Stock disponible: *${product.stock} uds*\n• Solicitado: *${qty} uds*\nNo se pudo procesar la venta.`,
    };
  }

  // Deduct stock
  const stockBefore = product.stock;
  product.stock = stockBefore - qty;
  if (product.stock <= 0) {
    product.isHidden = true;
  }
  await product.save();

  // Record stock movement
  await StockHistory.create({
    productId: product.id,
    productName: `${product.marca} ${product.modelo} (${product.calidad})`,
    type: 'salida',
    qty,
    stockBefore,
    stockAfter: product.stock,
    reason: `Venta WhatsApp Administrador (${cliente || 'Consumidor Final'})`,
  });

  // Calculate totals (exchange rate 300 fallback)
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
      `• Stock restante en almacén: *${product.stock} unidades* ${product.stock === 0 ? '⚠️ (Agotado)' : ''}`,
  };
}
