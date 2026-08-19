import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import seedProducts from '@/data/products_seed.json';

export const dynamic = 'force-dynamic'; // Evita que Next.js guarde la respuesta en caché

// Make sure we connect to the DB
export async function GET() {
  try {
    await connectToDatabase();

    // Fetch all active products
    const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
    
    // Count how many are hidden (soft deleted)
    const deletedCount = await Product.countDocuments({ isHidden: true });

    return NextResponse.json({
      success: true,
      count: activeProducts.length,
      deletedCount,
      products: activeProducts,
    });
  } catch (error) {
    console.error('API GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error obteniendo productos de la base de datos' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    
    const body = await request.json();
    const { action, id, product, initialList } = body;

    // -----------------------------------------
    // ACTION: DELETE (SOFT DELETE)
    // -----------------------------------------
    if (action === 'delete' && id) {
      await Product.findOneAndUpdate({ id }, { isHidden: true });
      
      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: 'Producto ocultado en la base de datos globalmente',
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: UNHIDE (Restore a hidden product)
    // -----------------------------------------
    if (action === 'unhide' && id) {
      const stockVal = Number(body.stock);
      const newStock = !isNaN(stockVal) && stockVal > 0 ? stockVal : 1;

      await Product.findOneAndUpdate(
        { id },
        { isHidden: false, stock: newStock }
      );

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: 'Producto restaurado al catálogo activo',
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: DELETE-PERMANENT (Hard delete)
    // -----------------------------------------
    if (action === 'delete-permanent' && id) {
      await Product.findOneAndDelete({ id });

      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: 'Producto eliminado permanentemente de la base de datos',
        deletedCount,
      });
    }

    // -----------------------------------------
    // ACTION: RESTORE (Reset to Seed)
    // -----------------------------------------
    if (action === 'restore') {
      // Clear entire collection
      await Product.deleteMany({});
      
      // Insert Seed Data
      const newProducts = seedProducts.map((p: any) => ({ ...p, isHidden: false }));
      await Product.insertMany(newProducts);

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      
      return NextResponse.json({
        success: true,
        message: 'Catálogo restaurado al estado original en la base de datos',
        count: activeProducts.length,
        deletedCount: 0,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: ADD
    // -----------------------------------------
    if (action === 'add' && product) {
      const newProductDoc = await Product.create({
        id: `display-custom-${Date.now()}`,
        marca: (product.marca || 'VARIOS').toUpperCase().trim(),
        modelo: product.modelo?.trim() || 'Nuevo Modelo',
        calidad: product.calidad?.toUpperCase().trim() || 'ORIGINAL',
        precio: Number(product.precio) || 0,
        stock: Number(product.stock) || 1,
        isHidden: false
      });

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: 'Producto agregado globalmente a la base de datos',
        product: newProductDoc,
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: SYNC (Upload new Excel)
    // -----------------------------------------
    if (action === 'sync' && Array.isArray(initialList)) {
      // Hard delete old database to completely refresh catalog based on Excel
      await Product.deleteMany({});
      
      // Prepare mapping
      const toInsert = initialList.map((p) => ({ ...p, isHidden: false }));
      await Product.insertMany(toInsert);

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();

      return NextResponse.json({
        success: true,
        message: 'Catálogo sincronizado exitosamente con el Excel en la BD',
        count: activeProducts.length,
        deletedCount: 0,
        products: activeProducts,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Acción no válida' },
      { status: 400 }
    );
  } catch (error) {
    console.error('API POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error procesando solicitud en la base de datos' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID de producto requerido' },
        { status: 400 }
      );
    }

    await Product.findOneAndUpdate({ id }, { isHidden: true });

    const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
    const deletedCount = await Product.countDocuments({ isHidden: true });

    return NextResponse.json({
      success: true,
      message: `Producto ${id} ocultado`,
      count: activeProducts.length,
      deletedCount,
      products: activeProducts,
    });
  } catch (error) {
    console.error('API DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error procesando eliminación en la base de datos' },
      { status: 500 }
    );
  }
}
