import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduct extends Document {
  id: string; // Maintain the 'id' field to keep frontend compatibility
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock: number;
  isHidden: boolean; // Magic soft delete property
}

const ProductSchema = new Schema<IProduct>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    marca: {
      type: String,
      required: true,
      trim: true,
    },
    modelo: {
      type: String,
      required: true,
      trim: true,
    },
    calidad: {
      type: String,
      required: true,
      trim: true,
    },
    precio: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      default: 1,
      min: 0,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Auto createdAt and updatedAt
  }
);

// We define the model safely to avoid "Cannot overwrite model once compiled" errors in Next.js dev mode
export const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
