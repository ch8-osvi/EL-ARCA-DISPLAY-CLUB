import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
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
      
      // Insert Seed Data enforcing uppercase
      const newProducts = seedProducts.map((p: any) => ({
        ...p,
        marca: (p.marca || 'VARIOS').toUpperCase().trim(),
        modelo: (p.modelo || '').toUpperCase().trim(),
        calidad: (p.calidad || 'ORIGINAL').toUpperCase().trim(),
        isHidden: false,
      }));
      await Product.insertMany(newProducts);

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      
      return NextResponse.json({
        success: true,
        message: 'Catálogo restaurado al estado original en la base de datos (con marcas y modelos en mayúsculas)',
        count: activeProducts.length,
        deletedCount: 0,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: ADD (with smart duplicate stock sum & auto-unhide)
    // -----------------------------------------
    if (action === 'add' && product) {
      const marcaUp = (product.marca || 'VARIOS').toUpperCase().trim();
      const modeloUp = (product.modelo || 'NUEVO MODELO').toUpperCase().trim();
      const calidadUp = (product.calidad || 'ORIGINAL').toUpperCase().trim();
      const newStock = Math.max(0, Number(product.stock) || 1);
      const newPrecio = Math.max(0, Number(product.precio) || 0);

      // Check if product already exists (including hidden or stock 0 ones)
      const existingProduct = await Product.findOne({
        marca: marcaUp,
        modelo: { $regex: new RegExp(`^${modeloUp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        calidad: calidadUp,
      });

      let savedProduct;
      let wasUpdated = false;

      if (existingProduct) {
        wasUpdated = true;
        const stockBefore = existingProduct.stock || 0;
        const stockAfter = stockBefore + newStock;
        
        existingProduct.stock = stockAfter;
        if (newPrecio > 0) {
          existingProduct.precio = newPrecio;
        }
        // If stock > 0, make sure it exits agotados / ocultos
        if (stockAfter > 0) {
          existingProduct.isHidden = false;
        }
        savedProduct = await existingProduct.save();

        if (newStock > 0) {
          await StockHistory.create({
            productId: existingProduct.id,
            productName: `${existingProduct.marca} ${existingProduct.modelo} (${existingProduct.calidad})`,
            type: 'entrada',
            qty: newStock,
            stockBefore,
            stockAfter,
            reason: 'Reingreso de producto existente (Suma automática de stock)',
          });
        }
      } else {
        const customId = `display-custom-${Date.now()}`;
        savedProduct = await Product.create({
          id: customId,
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          precio: newPrecio,
          stock: newStock,
          isHidden: newStock === 0,
        });

        if (newStock > 0) {
          await StockHistory.create({
            productId: customId,
            productName: `${marcaUp} ${modeloUp} (${calidadUp})`,
            type: 'entrada',
            qty: newStock,
            stockBefore: 0,
            stockAfter: newStock,
            reason: 'Alta de nuevo producto en catálogo',
          });
        }
      }

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: wasUpdated
          ? `Producto existente reconocido: se sumaron +${newStock} uds al stock (Total: ${savedProduct.stock} uds) y se reactivó en el catálogo activo.`
          : 'Nuevo producto agregado globalmente a la base de datos',
        product: savedProduct,
        wasUpdated,
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: UPDATE (Edit existing display)
    // -----------------------------------------
    if (action === 'update' && id) {
      const updateData: Record<string, any> = {};
      if (body.precio !== undefined) updateData.precio = Math.max(0, Number(body.precio));
      if (body.stock !== undefined) {
        const s = Math.max(0, Number(body.stock));
        updateData.stock = s;
        if (s > 0) updateData.isHidden = false;
      }
      if (body.calidad) updateData.calidad = String(body.calidad).toUpperCase().trim();
      if (body.modelo) updateData.modelo = String(body.modelo).toUpperCase().trim();
      if (body.marca) updateData.marca = String(body.marca).toUpperCase().trim();

      const updatedDoc = await Product.findOneAndUpdate(
        { id },
        { $set: updateData },
        { new: true }
      );

      if (!updatedDoc) {
        return NextResponse.json(
          { success: false, error: 'Display no encontrado para actualizar' },
          { status: 404 }
        );
      }

      const activeProducts = await Product.find({ isHidden: false }).sort({ createdAt: -1 }).lean();
      const deletedCount = await Product.countDocuments({ isHidden: true });

      return NextResponse.json({
        success: true,
        message: `Display ${updatedDoc.modelo} actualizado correctamente en la base de datos`,
        product: updatedDoc,
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
      
      // Prepare mapping enforcing uppercase
      const toInsert = initialList.map((p) => ({
        ...p,
        marca: (p.marca || 'VARIOS').toUpperCase().trim(),
        modelo: (p.modelo || '').toUpperCase().trim(),
        calidad: (p.calidad || 'ORIGINAL').toUpperCase().trim(),
        isHidden: (p.stock || 0) === 0 ? false : false,
      }));
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
