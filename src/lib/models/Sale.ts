import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISaleItem {
  productId:  string;
  marca:      string;
  modelo:     string;
  calidad:    string;
  qty:        number;
  precioUSD:  number;
  subtotalUSD:number;
}

export interface ISale extends Document {
  orderNumber: string;
  clientName:  string;
  items:       ISaleItem[];
  currency:    'USD' | 'CUP';
  exchangeRate:number;
  subtotalUSD: number;
  totalUSD:    number;
  totalCUP:    number;
  paid:        boolean;
  notes:       string;
  createdAt:   Date;
  updatedAt:   Date;
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    productId:   { type: String, required: true },
    marca:       { type: String, required: true },
    modelo:      { type: String, required: true },
    calidad:     { type: String, required: true },
    qty:         { type: Number, required: true, min: 1 },
    precioUSD:   { type: Number, required: true, min: 0 },
    subtotalUSD: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SaleSchema = new Schema<ISale>(
  {
    orderNumber:  { type: String, required: true, unique: true },
    clientName:   { type: String, default: '' },
    items: {
      type: [SaleItemSchema],
      required: true,
      validate: [(v: ISaleItem[]) => v.length > 0, 'La orden debe tener al menos 1 producto'],
    },
    currency:     { type: String, enum: ['USD', 'CUP'], default: 'USD' },
    exchangeRate: { type: Number, required: true, min: 1 },
    subtotalUSD:  { type: Number, required: true, min: 0 },
    totalUSD:     { type: Number, required: true, min: 0 },
    totalCUP:     { type: Number, required: true, min: 0 },
    paid:         { type: Boolean, default: false },
    notes:        { type: String, default: '' },
  },
  { timestamps: true }
);

export const Sale: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>('Sale', SaleSchema);
