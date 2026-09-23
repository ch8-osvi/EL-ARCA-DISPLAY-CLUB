import { NextResponse } from 'next/server';
import { executeNormalizarCatalogoExistente } from '@/lib/ai/adminTools';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await executeNormalizarCatalogoExistente();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
