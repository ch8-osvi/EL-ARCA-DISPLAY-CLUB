import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStockHistory extends Document {
  productId:   string;
  productName: string;
  type:        'entrada' | 'salida';
  qty:         number;
  stockBefore: number;
  stockAfter:  number;
  reason:      string;
  createdAt:   Date;
}

const StockHistorySchema = new Schema<IStockHistory>(
  {
    productId:   { type: String, required: true, index: true },
    productName: { type: String, required: true },
    type:        { type: String, enum: ['entrada', 'salida'], required: true },
    qty:         { type: Number, required: true, min: 1 },
    stockBefore: { type: Number, required: true, min: 0 },
    stockAfter:  { type: Number, required: true, min: 0 },
    reason:      { type: String, default: '' },
  },
  { timestamps: true }
);

export const StockHistory: Model<IStockHistory> =
  mongoose.models.StockHistory ||
  mongoose.model<IStockHistory>('StockHistory', StockHistorySchema);
