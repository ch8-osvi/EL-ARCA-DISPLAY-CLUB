import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExchangeRate extends Document {
  rate:      number;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  { rate: { type: Number, required: true, min: 1 } },
  { timestamps: true }
);

export const ExchangeRate: Model<IExchangeRate> =
  mongoose.models.ExchangeRate ||
  mongoose.model<IExchangeRate>('ExchangeRate', ExchangeRateSchema);
