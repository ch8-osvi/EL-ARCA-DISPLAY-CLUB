import dbConnect from '@/lib/mongoose';
import { ExchangeRate } from '@/lib/models/ExchangeRate';

export function validExchangeRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1;
}
export async function getActiveExchangeRate() {
  await dbConnect();
  const doc = await ExchangeRate.findById('000000000000000000000001').lean()
    ?? await ExchangeRate.findOne().sort({ updatedAt: -1, _id: -1 }).lean();
  return doc && validExchangeRate(doc.rate) ? doc : null;
}
export async function saveActiveExchangeRate(rate: number) {
  if (!validExchangeRate(rate)) throw new Error('Tasa inválida');
  await dbConnect();
  return ExchangeRate.findOneAndUpdate(
    { _id: '000000000000000000000001' }, { $set: { rate } },
    { upsert: true, new: true, runValidators: true },
  );
}
