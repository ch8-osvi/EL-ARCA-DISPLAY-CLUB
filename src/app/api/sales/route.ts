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
 * Returns all sales sorted newest first, plus daily summary metrics.
 */
export async function GET() {
  try {
    await connectToDatabase();

    const sales = await Sale.find({}).sort({ createdAt: -1 }).lean();

    // Daily summary (today only)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySales = sales.filter((s) => new Date(s.createdAt) >= today);

    const todayTotalUSD  = todaySales.reduce((acc, s) => acc + s.totalUSD, 0);
    const todayTotalCUP  = todaySales.reduce((acc, s) => acc + s.totalCUP, 0);
    const todayPaidSales = todaySales.filter((s) => s.paid);
    const todayPaidUSD   = todayPaidSales.reduce((acc, s) => acc + s.totalUSD, 0);
    const todayPaidCUP   = todayPaidSales.reduce((acc, s) => acc + s.totalCUP, 0);

    return NextResponse.json({
      success: true,
      sales,
      daily: {
        count:        todaySales.length,
        todayTotalUSD,
        todayTotalCUP,
        todayPaidUSD,
        todayPaidCUP,
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
          marca:      product.marca,
          modelo:     product.modelo,
          calidad:    product.calidad,
          qty,
          precioUSD:  item.precioUSD,
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
      });

      return NextResponse.json({ success: true, sale });
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
    return NextResponse.json({ success: false, error: 'Error procesando venta' }, { status: 500 });
  }
}
