import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { Sale } from '@/lib/models/Sale';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const { primaryId, secondaryId, finalModelo, finalPrecio, finalCalidad } = body;

    if (!primaryId || !secondaryId) {
      return NextResponse.json(
        { success: false, error: 'Debes especificar el producto principal y el producto a fusionar' },
        { status: 400 }
      );
    }

    if (primaryId === secondaryId) {
      return NextResponse.json(
        { success: false, error: 'No puedes fusionar un producto consigo mismo' },
        { status: 400 }
      );
    }

    // 1. Buscar ambos productos
    const [primaryProduct, secondaryProduct] = await Promise.all([
      Product.findOne({ id: primaryId }),
      Product.findOne({ id: secondaryId }),
    ]);

    if (!primaryProduct) {
      return NextResponse.json(
        { success: false, error: `No se encontró el producto principal (ID: ${primaryId})` },
        { status: 404 }
      );
    }

    if (!secondaryProduct) {
      return NextResponse.json(
        { success: false, error: `No se encontró el producto secundario a fusionar (ID: ${secondaryId})` },
        { status: 404 }
      );
    }

    const stockPrimary = Math.max(0, primaryProduct.stock || 0);
    const stockSecondary = Math.max(0, secondaryProduct.stock || 0);
    const combinedStock = stockPrimary + stockSecondary;

    // 2. Determinar atributos finales
    const cleanModelo = (finalModelo || primaryProduct.modelo).toUpperCase().trim();
    const cleanPrecio =
      finalPrecio !== undefined && !isNaN(Number(finalPrecio)) && Number(finalPrecio) >= 0
        ? Number(finalPrecio)
        : primaryProduct.precio;
    const cleanCalidad = (finalCalidad || primaryProduct.calidad).toUpperCase().trim();

    // 3. Actualizar producto principal
    primaryProduct.modelo = cleanModelo;
    primaryProduct.precio = cleanPrecio;
    primaryProduct.calidad = cleanCalidad;
    primaryProduct.stock = combinedStock;
    if (combinedStock > 0) {
      primaryProduct.isHidden = false; // Reactivar si estaba agotado
    }

    await primaryProduct.save();

    // 4. Migrar historial previo de movimientos del secundario al principal
    await StockHistory.updateMany(
      { productId: secondaryProduct.id },
      {
        $set: {
          productId: primaryProduct.id,
          productName: `${primaryProduct.marca} ${cleanModelo} (${cleanCalidad})`,
        },
      }
    );

    // 5. Migrar referencias en ventas previas
    await Sale.updateMany(
      { 'items.productId': secondaryProduct.id },
      {
        $set: {
          'items.$[elem].productId': primaryProduct.id,
          'items.$[elem].modelo': cleanModelo,
        },
      },
      { arrayFilters: [{ 'elem.productId': secondaryProduct.id }] }
    );

    // 6. Asentar registro de auditoría de la fusión en StockHistory
    await StockHistory.create({
      productId: primaryProduct.id,
      productName: `${primaryProduct.marca} ${cleanModelo} (${cleanCalidad})`,
      type: 'entrada',
      qty: Math.max(1, stockSecondary),
      stockBefore: stockPrimary,
      stockAfter: combinedStock,
      reason: `Fusión de inventario: se unificó el producto "${secondaryProduct.modelo}" (${secondaryProduct.id}, +${stockSecondary} uds) en este producto. Precio final: $${cleanPrecio} USD.`,
    });

    // 7. Eliminar el producto secundario duplicado
    await Product.deleteOne({ _id: secondaryProduct._id });

    // 8. Devolver catálogo activo actualizado
    const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
    const deletedCount = await Product.countDocuments({ isHidden: true });

    return NextResponse.json({
      success: true,
      message: `Fusión completada con éxito. Nuevo stock total: ${combinedStock} unidades. Precio: $${cleanPrecio} USD.`,
      product: primaryProduct,
      count: activeProducts.length,
      deletedCount,
      products: activeProducts,
    });
  } catch (error) {
    console.error('API /api/products/merge Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Error procesando fusión: ${msg}` },
      { status: 500 }
    );
  }
}
