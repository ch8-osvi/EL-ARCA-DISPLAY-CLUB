import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stock
 * - ?productId=xxx: returns stock movement history for that specific product
 * - ?type=merma: returns all waste / defective / broken product records
 * - Default: returns all products (active + hidden) with stock info
 */
export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    const type = searchParams.get('type');

    // Return movement history for a specific product
    if (productId) {
      const history = await StockHistory.find({ productId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return NextResponse.json({ success: true, history });
    }

    // Return all merma records
    if (type === 'merma') {
      const mermas = await StockHistory.find({ type: 'merma' })
        .sort({ createdAt: -1 })
        .lean();
      return NextResponse.json({ success: true, mermas });
    }

    // Return all products (for inventory view)
    const products = await Product.find({}).sort({ marca: 1, modelo: 1 }).lean();
    return NextResponse.json({ success: true, products });
  } catch (err) {
    console.error('[stock GET]', err);
    return NextResponse.json({ success: false, error: 'Error obteniendo inventario' }, { status: 500 });
  }
}

/**
 * POST /api/stock
 * body: { action: 'add', productId, qty, reason }
 * Adds stock to a product and records the movement.
 */
export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { action, productId, qty, reason } = await req.json();

    if (action === 'add') {
      const qtyNum = parseInt(qty, 10);
      if (!productId || !qtyNum || isNaN(qtyNum) || qtyNum < 1) {
        return NextResponse.json(
          { success: false, error: 'Datos inválidos: productId y qty >= 1 son requeridos' },
          { status: 400 }
        );
      }

      const product = await Product.findOne({ id: productId });
      if (!product) {
        return NextResponse.json(
          { success: false, error: 'Producto no encontrado' },
          { status: 404 }
        );
      }

      const stockBefore = product.stock;
      product.stock = stockBefore + qtyNum;

      // Automatically unhide if it was hidden
      if (product.isHidden && product.stock > 0) {
        product.isHidden = false;
      }
      await product.save();

      // Record in StockHistory
      const movement = await StockHistory.create({
        productId: product.id,
        productName: `${product.marca} ${product.modelo} (${product.calidad})`,
        type: 'entrada',
        qty: qtyNum,
        stockBefore,
        stockAfter: product.stock,
        reason: reason || 'Entrada manual de stock',
      });

      return NextResponse.json({
        success: true,
        message: `+${qtyNum} unidades añadidas correctamente`,
        product,
        movement,
      });
    }

    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    console.error('[stock POST]', err);
    return NextResponse.json({ success: false, error: 'Error ajustando stock' }, { status: 500 });
  }
}
