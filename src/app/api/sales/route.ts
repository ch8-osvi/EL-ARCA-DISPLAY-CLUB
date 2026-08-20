import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';

export const dynamic = 'force-dynamic';

/** Generates order number: MMDD + 3 random letters + product count (zero-padded to 2) */
function generateOrderNumber(totalItems: number): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('');
  const count = String(totalItems).padStart(2, '0');
  return `${mm}${dd}${letters}${count}`;
}

/**
 * GET /api/sales
 * Returns all sales sorted newest first, plus daily summary metrics (gross, refunds, net).
 */
export async function GET() {
  try {
    await connectToDatabase();

    const sales = await Sale.find({}).sort({ createdAt: -1 }).lean();

    // Daily summary (today only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySales = sales.filter((s) => new Date(s.createdAt) >= today);

    // USD CASH DRAWER (Transactions paid in USD)
    const todayUSDSales     = todaySales.filter((s) => (s.currency || 'USD') === 'USD');
    const todayPaidUSDSales = todayUSDSales.filter((s) => s.paid);
    const todayGrossUSD     = todayPaidUSDSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const todayRefundsUSD   = todayUSDSales.reduce((acc, s) => acc + (s.totalRefundedUSD || 0), 0);
    const todayNetUSD       = parseFloat((todayGrossUSD - todayRefundsUSD).toFixed(2));
    const todayPendingUSD   = todayUSDSales.filter((s) => !s.paid).reduce((acc, s) => acc + s.totalUSD, 0);

    // CUP CASH DRAWER (Transactions paid in CUP)
    const todayCUPSales     = todaySales.filter((s) => s.currency === 'CUP');
    const todayPaidCUPSales = todayCUPSales.filter((s) => s.paid);
    const todayGrossCUP     = todayPaidCUPSales.reduce((acc, s) => acc + s.totalCUP, 0);
    const todayRefundsCUP   = todayCUPSales.reduce((acc, s) => acc + (s.totalRefundedCUP || 0), 0);
    const todayNetCUP       = parseFloat((todayGrossCUP - todayRefundsCUP).toFixed(2));
    const todayPendingCUP   = todayCUPSales.filter((s) => !s.paid).reduce((acc, s) => acc + s.totalCUP, 0);

    return NextResponse.json({
      success: true,
      sales,
      daily: {
        count:           todaySales.length,
        usdCount:        todayUSDSales.length,
        cupCount:        todayCUPSales.length,

        // USD Drawer
        todayGrossUSD,
        todayRefundsUSD,
        todayNetUSD,
        todayPendingUSD,

        // CUP Drawer
        todayGrossCUP,
        todayRefundsCUP,
        todayNetCUP,
        todayPendingCUP,
      },
    });
  } catch (err) {
    console.error('[sales GET]', err);
    return NextResponse.json({ success: false, error: 'Error obteniendo ventas' }, { status: 500 });
  }
}

/**
 * POST /api/sales
 * Actions:
 *  - create: registers a sale, deducts stock, records movements
 *  - toggle-paid: toggles paid status on an existing sale
 *  - refund: processes partial or total return, restores stock, logs reason & returns audit
 */
export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { action } = body;

    // --------------------------------------------------------
    // ACTION: CREATE SALE
    // --------------------------------------------------------
    if (action === 'create') {
      const { clientName, items, currency, exchangeRate, paid, notes } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { success: false, error: 'La orden debe tener al menos 1 producto' },
          { status: 400 }
        );
      }

      // Validate and deduct stock for each item atomically
      const processedItems: any[] = [];
      for (const item of items) {
        const { productId, qty } = item;
        if (!productId || !qty || qty < 1) {
          return NextResponse.json(
            { success: false, error: `Ítem inválido: ${JSON.stringify(item)}` },
            { status: 400 }
          );
        }

        const product = await Product.findOne({ id: productId });
        if (!product) {
          return NextResponse.json(
            { success: false, error: `Producto no encontrado: ${productId}` },
            { status: 404 }
          );
        }
        if (product.stock < qty) {
          return NextResponse.json(
            {
              success: false,
              error: `Stock insuficiente para ${product.marca} ${product.modelo}. Disponible: ${product.stock}, solicitado: ${qty}`,
            },
            { status: 409 }
          );
        }

        const stockBefore = product.stock;
        product.stock = stockBefore - qty;

        // Auto-hide if stock reaches 0
        if (product.stock <= 0) {
          product.isHidden = true;
        }
        await product.save();

        // Record stock movement
        await StockHistory.create({
          productId:   product.id,
          productName: `${product.marca} ${product.modelo} (${product.calidad})`,
          type:        'salida',
          qty,
          stockBefore,
          stockAfter:  product.stock,
          reason:      `Venta POS`,
        });

        const subtotalUSD = parseFloat((item.precioUSD * qty).toFixed(2));
        processedItems.push({
          productId,
          marca:       product.marca,
          modelo:      product.modelo,
          calidad:     product.calidad,
          qty,
          returnedQty: 0,
          precioUSD:   item.precioUSD,
          subtotalUSD,
        });
      }

      // Calculate totals
      const totalItemsCount = processedItems.reduce((acc, i) => acc + i.qty, 0);
      const subtotalUSD = parseFloat(
        processedItems.reduce((acc, i) => acc + i.subtotalUSD, 0).toFixed(2)
      );
      const totalUSD  = subtotalUSD;
      const rateNum   = parseFloat(exchangeRate) || 300;
      const totalCUP  = parseFloat((totalUSD * rateNum).toFixed(2));

      // Generate unique order number (retry up to 5 times on collision)
      let orderNumber = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        orderNumber = generateOrderNumber(totalItemsCount);
        const exists = await Sale.findOne({ orderNumber });
        if (!exists) break;
      }

      const sale = await Sale.create({
        orderNumber,
        clientName: clientName || 'Consumidor Final',
        items: processedItems,
        currency:     currency || 'USD',
        exchangeRate: rateNum,
        subtotalUSD,
        totalUSD,
        totalCUP,
        paid:  paid !== undefined ? paid : true,
        notes: notes || '',
        status: 'COMPLETED',
        totalRefundedUSD: 0,
        totalRefundedCUP: 0,
        refunds: [],
      });

      return NextResponse.json({ success: true, sale });
    }

    // --------------------------------------------------------
    // ACTION: REFUND / RETURN ITEM(S)
    // --------------------------------------------------------
    if (action === 'refund') {
      const { saleId, returns, reason } = body;

      if (!saleId || !Array.isArray(returns) || returns.length === 0) {
        return NextResponse.json(
          { success: false, error: 'saleId y lista de devoluciones son requeridos' },
          { status: 400 }
        );
      }
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { success: false, error: 'Debes indicar el motivo de la devolución' },
          { status: 400 }
        );
      }

      const sale = await Sale.findById(saleId);
      if (!sale) {
        return NextResponse.json(
          { success: false, error: 'Venta no encontrada' },
          { status: 404 }
        );
      }

      let totalBatchRefundUSD = 0;
      let totalBatchRefundCUP = 0;
      const refundLogs: any[] = [];

      for (const ret of returns) {
        const { productId, qty } = ret;
        const qtyNum = parseInt(qty, 10);
        if (!productId || !qtyNum || isNaN(qtyNum) || qtyNum < 1) continue;

        const item = sale.items.find((i) => i.productId === productId);
        if (!item) {
          return NextResponse.json(
            { success: false, error: `El producto con ID ${productId} no está en esta orden` },
            { status: 400 }
          );
        }

        const currentlyReturned = item.returnedQty || 0;
        const availableToReturn = item.qty - currentlyReturned;

        if (qtyNum > availableToReturn) {
          return NextResponse.json(
            {
              success: false,
              error: `No puedes devolver ${qtyNum} unidades de ${item.marca} ${item.modelo}. Máximo disponible para devolución: ${availableToReturn}`,
            },
            { status: 400 }
          );
        }

        // Update item returned quantity
        item.returnedQty = currentlyReturned + qtyNum;

        const itemRefundUSD = parseFloat((item.precioUSD * qtyNum).toFixed(2));
        const itemRefundCUP = parseFloat((itemRefundUSD * sale.exchangeRate).toFixed(2));

        totalBatchRefundUSD += itemRefundUSD;
        totalBatchRefundCUP += itemRefundCUP;

        const itemDestination: 'stock' | 'merma' = ret.destination === 'merma' ? 'merma' : 'stock';

        const logEntry = {
          productId,
          marca:       item.marca,
          modelo:      item.modelo,
          calidad:     item.calidad,
          qty:         qtyNum,
          refundUSD:   itemRefundUSD,
          refundCUP:   itemRefundCUP,
          reason:      reason.trim(),
          destination: itemDestination,
          createdAt:   new Date(),
        };

        sale.refunds.push(logEntry);
        refundLogs.push(logEntry);

        // Fetch product
        const product = await Product.findOne({ id: productId });
        if (product) {
          const stockBefore = product.stock;

          if (itemDestination === 'stock') {
            // Reincorporate good units into sellable stock
            product.stock = stockBefore + qtyNum;
            if (product.isHidden && product.stock > 0) {
              product.isHidden = false;
            }
            await product.save();

            // Record in StockHistory as 'entrada'
            await StockHistory.create({
              productId:   product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type:        'entrada',
              qty:         qtyNum,
              stockBefore,
              stockAfter:  product.stock,
              reason:      `Devolución Orden #${sale.orderNumber}: ${reason.trim()} [Reintegrado a Stock]`,
            });
          } else {
            // MERMA: Defective / Broken part. Do NOT increase sellable stock!
            await StockHistory.create({
              productId:   product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type:        'merma',
              qty:         qtyNum,
              stockBefore,
              stockAfter:  stockBefore,
              reason:      `Devolución Orden #${sale.orderNumber}: ${reason.trim()} [MERMA / ROTO / DEFECTUOSO - No apto para venta]`,
            });
          }
        }
      }

      // Update sale refunded totals
      sale.totalRefundedUSD = parseFloat(((sale.totalRefundedUSD || 0) + totalBatchRefundUSD).toFixed(2));
      sale.totalRefundedCUP = parseFloat(((sale.totalRefundedCUP || 0) + totalBatchRefundCUP).toFixed(2));

      // Calculate status
      const totalPurchased = sale.items.reduce((acc, i) => acc + i.qty, 0);
      const totalReturned  = sale.items.reduce((acc, i) => acc + (i.returnedQty || 0), 0);

      if (totalReturned >= totalPurchased) {
        sale.status = 'REFUNDED';
      } else if (totalReturned > 0) {
        sale.status = 'PARTIALLY_REFUNDED';
      }

      await sale.save();

      return NextResponse.json({
        success: true,
        message: 'Devolución procesada y stock reintegrado con éxito',
        sale,
        refundLogs,
        totalRefundUSD: totalBatchRefundUSD,
        totalRefundCUP: totalBatchRefundCUP,
      });
    }

    // --------------------------------------------------------
    // ACTION: TOGGLE PAID
    // --------------------------------------------------------
    if (action === 'toggle-paid') {
      const { saleId } = body;
      if (!saleId) {
        return NextResponse.json(
          { success: false, error: 'saleId requerido' },
          { status: 400 }
        );
      }
      const sale = await Sale.findById(saleId);
      if (!sale) {
        return NextResponse.json(
          { success: false, error: 'Venta no encontrada' },
          { status: 404 }
        );
      }
      sale.paid = !sale.paid;
      await sale.save();
      return NextResponse.json({ success: true, sale });
    }

    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    console.error('[sales POST]', err);
    return NextResponse.json({ success: false, error: 'Error procesando solicitud de venta' }, { status: 500 });
  }
}
