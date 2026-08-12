import { NextResponse } from 'next/server';
import seedProducts from '../../../data/products_seed.json';
import { Product } from '../../../lib/types';

// In-memory state for prototype server persistence
// On Vercel, this persists across requests in warm serverless instances
let productsState: Product[] = [...(seedProducts as Product[])];

export async function GET() {
  return NextResponse.json({
    success: true,
    count: productsState.length,
    products: productsState,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, id, product, initialList } = body;

    if (action === 'delete' && id) {
      productsState = productsState.filter((p) => p.id !== id);
      return NextResponse.json({
        success: true,
        message: 'Producto eliminado globalmente',
        count: productsState.length,
        products: productsState,
      });
    }

    if (action === 'restore') {
      productsState = [...(seedProducts as Product[])];
      return NextResponse.json({
        success: true,
        message: 'Catálogo restaurado al estado original del Excel',
        count: productsState.length,
        products: productsState,
      });
    }

    if (action === 'add' && product) {
      const newProduct: Product = {
        id: `display-custom-${Date.now()}`,
        marca: (product.marca || 'VARIOS').toUpperCase().trim(),
        modelo: product.modelo?.trim() || 'Nuevo Modelo',
        calidad: product.calidad?.toUpperCase().trim() || 'ORIGINAL',
        precio: Number(product.precio) || 0,
        stock: Number(product.stock) || 1,
      };

      productsState = [newProduct, ...productsState];
      return NextResponse.json({
        success: true,
        message: 'Producto agregado globalmente',
        product: newProduct,
        products: productsState,
      });
    }

    if (action === 'sync' && Array.isArray(initialList)) {
      productsState = [...initialList];
      return NextResponse.json({
        success: true,
        count: productsState.length,
        products: productsState,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Acción no válida' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error procesando solicitud' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'ID de producto requerido' },
      { status: 400 }
    );
  }

  productsState = productsState.filter((p) => p.id !== id);
  return NextResponse.json({
    success: true,
    message: `Producto ${id} eliminado`,
    count: productsState.length,
    products: productsState,
  });
}
