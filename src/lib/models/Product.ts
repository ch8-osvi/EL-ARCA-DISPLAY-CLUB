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
      uppercase: true,
      set: (v: string) => (typeof v === 'string' ? v.toUpperCase().trim() : v),
    },
    modelo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      set: (v: string) => (typeof v === 'string' ? v.toUpperCase().trim() : v),
    },
    calidad: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      set: (v: string) => (typeof v === 'string' ? v.toUpperCase().trim() : v),
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

// Pre-save hook: guarantee uppercase and automatically unhide if stock > 0
ProductSchema.pre('save', function () {
  if (this.marca) this.marca = this.marca.toUpperCase().trim();
  if (this.modelo) this.modelo = this.modelo.toUpperCase().trim();
  if (this.calidad) this.calidad = this.calidad.toUpperCase().trim();
  if (this.stock > 0 && this.isHidden) {
    this.isHidden = false;
  }
});

// Pre-update hook: guarantee uppercase and unhide if restocked in query updates
ProductSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = this.getUpdate() as any;
  if (!update) return;

  if (update.marca) update.marca = String(update.marca).toUpperCase().trim();
  if (update.modelo) update.modelo = String(update.modelo).toUpperCase().trim();
  if (update.calidad) update.calidad = String(update.calidad).toUpperCase().trim();

  if (update.$set) {
    if (update.$set.marca) update.$set.marca = String(update.$set.marca).toUpperCase().trim();
    if (update.$set.modelo) update.$set.modelo = String(update.$set.modelo).toUpperCase().trim();
    if (update.$set.calidad) update.$set.calidad = String(update.$set.calidad).toUpperCase().trim();
    if (typeof update.$set.stock === 'number' && update.$set.stock > 0) {
      update.$set.isHidden = false;
    }
  }

  if (update.$inc && typeof update.$inc.stock === 'number' && update.$inc.stock > 0) {
    if (!update.$set) update.$set = {};
    update.$set.isHidden = false;
  }
});

// We define the model safely to avoid "Cannot overwrite model once compiled" errors in Next.js dev mode
export const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
