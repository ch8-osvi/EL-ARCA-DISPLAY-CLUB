import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaMonthDay } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface BulkProductItem {
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock?: number;
}

/**
 * POST /api/products/bulk-add
 * Dedicated endpoint for large batch product insertions (up to 500 products).
 * Handles deduplication, bulk insertMany in batches of 50, and StockHistory logging.
 * Body: { productos: BulkProductItem[] }
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { productos } = body as { productos: BulkProductItem[] };

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Lista de productos vacía o inválida.' },
        { status: 400 }
      );
    }

    if (productos.length > 500) {
      return NextResponse.json(
        { success: false, error: 'El máximo por petición es 500 productos. Divide el lote.' },
        { status: 400 }
      );
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

    const toInsert: BulkProductItem[] = [];
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

    for (const item of productos) {
      const marcaUp   = (item.marca   || '').toUpperCase().trim();
      const modeloUp  = (item.modelo  || '').toUpperCase().trim();
      const calidadUp = (item.calidad || '').toUpperCase().trim();
      const qty       = Math.max(0, item.stock !== undefined ? Number(item.stock) : 1);
      const precio    = Math.max(0, Number(item.precio) || 0);

      if (!marcaUp || !modeloUp || !calidadUp) continue; // skip invalid rows

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

        // Update in-memory so subsequent duplicates in the same payload accumulate
        existing.stock = stockAfter;
        existing.isHidden = false;
      } else {
        toInsert.push({ ...item, marca: marcaUp, modelo: modeloUp, calidad: calidadUp, stock: qty, precio });
        // Register in existingMap to prevent duplicate inserts within the same batch
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

    // ━ Process updates for existing products (sum stock & pull out of agotados / ocultos)
    for (const inc of toIncrement) {
      const updateFields: any = {
        $inc: { stock: inc.qtyToAdd },
        $set: { isHidden: false }, // Reactivates if it was hidden/agotado
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
          reason:      'Reingreso/Suma de stock vía alta masiva (/api/products/bulk-add)',
        }));

      if (stockEntries.length > 0) {
        await StockHistory.insertMany(stockEntries, { ordered: false });
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        incremented: toIncrement.length,
        errors: 0,
        message: toIncrement.length > 0
          ? `Todos los productos ya existían en el catálogo. Se sumó el stock a ${toIncrement.length} productos existentes y se reactivaron.`
          : 'No se encontraron productos válidos para procesar.',
      });
    }

    // ━ Build insert documents with consistent IDs
    const insertDocs = toInsert.map((item) => {
      const rnd      = Math.random().toString(36).slice(2, 6).toUpperCase();
      const customId = `${mm}${dd}-${rnd}`;
      const stock    = item.stock ?? 1;
      return {
        customId,
        productName: `${item.marca} ${item.modelo} (${item.calidad})`,
        stock,
        doc: {
          id:       customId,
          marca:    item.marca,
          modelo:   item.modelo,
          calidad:  item.calidad,
          precio:   Number(item.precio) || 0,
          stock,
          isHidden: stock === 0,
        },
      };
    });

    // ━ Process in batches of 50 (safe for MongoDB / memory limits)
    const BATCH_SIZE   = 50;
    let totalInserted  = 0;
    let totalErrors    = 0;

    for (let i = 0; i < insertDocs.length; i += BATCH_SIZE) {
      const batch = insertDocs.slice(i, i + BATCH_SIZE);
      try {
        await Product.insertMany(batch.map((b) => b.doc), { ordered: false });

        // Bulk log stock history for this batch
        const stockEntries = batch
          .filter((b) => b.stock > 0)
          .map((b) => ({
            productId:   b.customId,
            productName: b.productName,
            type:        'entrada' as const,
            qty:         b.stock,
            stockBefore: 0,
            stockAfter:  b.stock,
            reason:      'Alta masiva vía endpoint /api/products/bulk-add',
          }));

        if (stockEntries.length > 0) {
          await StockHistory.insertMany(stockEntries, { ordered: false });
        }

        totalInserted += batch.length;
      } catch (batchErr) {
        console.error(`[bulk-add] Batch ${i / BATCH_SIZE + 1} error:`, batchErr);
        totalErrors += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      inserted:    totalInserted,
      incremented: toIncrement.length,
      errors:      totalErrors,
      message:
        `Alta masiva completada: ${totalInserted} producto(s) nuevo(s) insertado(s)` +
        (toIncrement.length > 0 ? ` y se sumó stock a ${toIncrement.length} producto(s) existente(s) (reactivados del catálogo).` : '.') +
        (totalErrors > 0        ? ` ${totalErrors} errores.` : ''),
    });
  } catch (error) {
    console.error('[bulk-add] Critical error:', error);
    return NextResponse.json(
      { success: false, error: 'Error crítico en alta masiva de productos.' },
      { status: 500 }
    );
  }
}
