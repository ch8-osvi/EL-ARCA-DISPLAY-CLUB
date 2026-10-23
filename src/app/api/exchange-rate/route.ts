import { NextResponse } from 'next/server';
import { getActiveExchangeRate, saveActiveExchangeRate, validExchangeRate } from '@/lib/exchangeRate';
import { getElToqueRate } from '@/lib/eltoque';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const doc = await getActiveExchangeRate();
    return NextResponse.json({ success: !!doc, rate: doc?.rate ?? null, updatedAt: doc?.updatedAt ?? null },
      { status: doc ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, rate: null, error: 'Error obteniendo tasa' }, { status: 503 });
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let rate = body.rate;
    if (body.source === 'eltoque') {
      const reference = await getElToqueRate();
      if (!reference.success || reference.stale || reference.rate !== rate) {
        return NextResponse.json({ success: false, error: 'La referencia cambió o está desactualizada. Actualiza el panel.' }, { status: 409 });
      }
      rate = reference.rate;
    }
    if (!validExchangeRate(rate)) return NextResponse.json({ success: false, error: 'Tasa inválida' }, { status: 400 });
    const doc = await saveActiveExchangeRate(rate);
    return NextResponse.json({ success: true, rate: doc!.rate });
  } catch {
    return NextResponse.json({ success: false, error: 'Error guardando tasa' }, { status: 500 });
  }
}
