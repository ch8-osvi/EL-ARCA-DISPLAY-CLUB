import { NextResponse } from 'next/server';
import { getElToqueRate } from '@/lib/eltoque';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const data = await getElToqueRate();
    return NextResponse.json(data, { status: data.success ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, rate: null, stale: true, error: 'Referencia elTOQUE no disponible' }, { status: 503 });
  }
}
