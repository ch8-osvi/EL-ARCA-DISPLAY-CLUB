import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { ExchangeRate } from '@/lib/models/ExchangeRate';

export const dynamic = 'force-dynamic';

/** GET /api/exchange-rate — Retrieves the latest saved rate */
export async function GET() {
  try {
    await connectToDatabase();
    const doc = await ExchangeRate.findOne().sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ success: true, rate: doc ? doc.rate : 300 });
  } catch (err) {
    console.error('[exchange-rate GET]', err);
    return NextResponse.json({ success: false, error: 'Error obteniendo tasa' }, { status: 500 });
  }
}

/** POST /api/exchange-rate — Saves / updates the rate */
export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const { rate } = await req.json();

    const num = parseFloat(rate);
    if (!num || isNaN(num) || num < 1) {
      return NextResponse.json({ success: false, error: 'Tasa inválida' }, { status: 400 });
    }

    // Upsert: keep only one document
    const doc = await ExchangeRate.findOne();
    if (doc) {
      doc.rate = num;
      await doc.save();
    } else {
      await ExchangeRate.create({ rate: num });
    }

    return NextResponse.json({ success: true, rate: num });
  } catch (err) {
    console.error('[exchange-rate POST]', err);
    return NextResponse.json({ success: false, error: 'Error guardando tasa' }, { status: 500 });
  }
}
