import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();
    // Solo mostrar productos ocultos que tengan stock > 0 (apartados/reservados para clientes)
    // Los productos con stock <= 0 pertenecen estrictamente a /admin/pos/inventario (Agotados)
    const hiddenProducts = await Product.find({ isHidden: true, stock: { $gt: 0 } })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      count: hiddenProducts.length,
      products: hiddenProducts,
    });
  } catch (error) {
    console.error('API GET hidden Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error obteniendo productos ocultos' },
      { status: 500 }
    );
  }
}
