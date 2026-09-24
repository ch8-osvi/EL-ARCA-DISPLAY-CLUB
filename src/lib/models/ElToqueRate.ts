import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IElToqueRate extends Document {
  rateUSD: number;
  updatedAt: Date;
}

const ElToqueRateSchema = new Schema<IElToqueRate>(
  {
    rateUSD: {
      type: Number,
      required: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const ElToqueRate: Model<IElToqueRate> =
  mongoose.models.ElToqueRate || mongoose.model<IElToqueRate>('ElToqueRate', ElToqueRateSchema);
