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

    // ━ Single pre-scan for all existing products (one DB call, not N)
    const existingProducts = await Product.find({ isHidden: false })
      .select('marca modelo calidad')
      .lean() as Array<{ marca: string; modelo: string; calidad: string }>;

    const existingSet = new Set(
      existingProducts.map((p) => `${p.marca}|${p.modelo.toLowerCase()}|${p.calidad}`)
    );

    const toInsert: BulkProductItem[] = [];
    const duplicatesFound: string[]   = [];

    for (const item of productos) {
      const marcaUp    = (item.marca   || '').toUpperCase().trim();
      const modeloTrim = (item.modelo  || '').trim();
      const calidadUp  = (item.calidad || '').toUpperCase().trim();

      if (!marcaUp || !modeloTrim || !calidadUp) continue; // skip invalid rows

      const key = `${marcaUp}|${modeloTrim.toLowerCase()}|${calidadUp}`;

      if (existingSet.has(key)) {
        duplicatesFound.push(`${marcaUp} ${modeloTrim} ${calidadUp}`);
      } else {
        existingSet.add(key); // prevent in-batch self-duplicates
        toInsert.push({ ...item, marca: marcaUp, modelo: modeloTrim, calidad: calidadUp });
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        duplicates: duplicatesFound.length,
        errors: 0,
        message: 'Todos los productos ya existían en el catálogo. No se insertó ninguno.',
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
      inserted:   totalInserted,
      duplicates: duplicatesFound.length,
      errors:     totalErrors,
      message:
        `Se insertaron ${totalInserted} productos correctamente.` +
        (duplicatesFound.length > 0 ? ` ${duplicatesFound.length} duplicados omitidos.` : '') +
        (totalErrors > 0            ? ` ${totalErrors} errores.`                        : ''),
    });
  } catch (error) {
    console.error('[bulk-add] Critical error:', error);
    return NextResponse.json(
      { success: false, error: 'Error crítico en alta masiva de productos.' },
      { status: 500 }
    );
  }
}
