import mongoose, { Schema, Document, Model } from "mongoose";
import {
  STORED_CATEGORY_IDS,
  productCategory,
  productDisplayModel,
  productQuality,
  type ProductCategory,
} from "../categories";

export interface IProduct extends Document {
  createdAt?: Date;
  updatedAt?: Date;
  categoria: ProductCategory;
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
    categoria: { type: String, enum: STORED_CATEGORY_IDS, default: "DISPLAY" },
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
      set: (v: string) => (typeof v === "string" ? v.toUpperCase().trim() : v),
    },
    modelo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      set: (v: string) => (typeof v === "string" ? v.toUpperCase().trim() : v),
    },
    calidad: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      set: (v: string) =>
        typeof v === "string" ? productQuality(v.toUpperCase().trim()) : v,
    },
    precio: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isFinite,
        message: "El precio debe ser finito",
      },
      min: 0,
    },
    stock: {
      type: Number,
      default: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "El stock debe ser entero",
      },
      min: 0,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Auto createdAt and updatedAt
  },
);

// Pre-save hook: guarantee uppercase
ProductSchema.pre("save", function () {
  this.modelo = productDisplayModel(this.modelo, this.categoria);
  this.categoria = productCategory(this.categoria);
  if (this.marca) this.marca = this.marca.toUpperCase().trim();
  if (this.modelo) this.modelo = this.modelo.toUpperCase().trim();
  if (this.calidad)
    this.calidad = productQuality(this.calidad.toUpperCase().trim());
});

// Pre-update hook: guarantee uppercase in query updates
ProductSchema.pre(["updateOne", "findOneAndUpdate", "updateMany"], function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = this.getUpdate() as any;
  if (!update) return;

  if (update.marca) update.marca = String(update.marca).toUpperCase().trim();
  if (update.modelo) update.modelo = String(update.modelo).toUpperCase().trim();
  if (update.calidad)
    update.calidad = productQuality(
      String(update.calidad).toUpperCase().trim(),
    );

  if (update.$set) {
    if (update.$set.marca)
      update.$set.marca = String(update.$set.marca).toUpperCase().trim();
    if (update.$set.modelo)
      update.$set.modelo = String(update.$set.modelo).toUpperCase().trim();
    if (update.$set.calidad)
      update.$set.calidad = productQuality(
        String(update.$set.calidad).toUpperCase().trim(),
      );
  }
});

// We define the model safely to avoid "Cannot overwrite model once compiled" errors in Next.js dev mode
export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);
