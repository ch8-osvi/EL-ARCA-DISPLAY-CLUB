import {
  REFUND_DESTINATIONS,
  type RefundDestination,
} from "../refundDestinations";
import { CATEGORY_IDS, type ProductCategory } from "../categories";
import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISaleRefund {
  requestId?: string;
  requestHash?: string;
  categoria?: ProductCategory;
  productId: string;
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  refundUSD: number;
  refundCUP: number;
  reason: string;
  destination: RefundDestination;
  createdAt: Date;
}

export interface ISaleItem {
  categoria?: ProductCategory;
  productId: string;
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  returnedQty?: number;
  precioUSD: number;
  subtotalUSD: number;
}

export interface ISale extends Document {
  requestId?: string;
  requestHash?: string;
  orderNumber: string;
  clientName: string;
  items: ISaleItem[];
  currency: "USD" | "CUP";
  exchangeRate: number;
  subtotalUSD: number;
  totalUSD: number;
  totalCUP: number;
  paid: boolean;
  notes: string;
  status: "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "CANCELLED";
  totalRefundedUSD: number;
  totalRefundedCUP: number;
  refunds: ISaleRefund[];
  createdAt: Date;
  updatedAt: Date;
}

const SaleRefundSchema = new Schema<ISaleRefund>(
  {
    requestId: { type: String, maxlength: 100 },
    requestHash: { type: String, maxlength: 64 },
    categoria: { type: String, enum: CATEGORY_IDS, default: "DISPLAY" },
    productId: { type: String, required: true },
    marca: { type: String, required: true },
    modelo: { type: String, required: true },
    calidad: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    refundUSD: { type: Number, required: true, min: 0 },
    refundCUP: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    destination: { type: String, enum: REFUND_DESTINATIONS, default: "stock" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SaleItemSchema = new Schema<ISaleItem>(
  {
    categoria: { type: String, enum: CATEGORY_IDS, default: "DISPLAY" },
    productId: { type: String, required: true },
    marca: { type: String, required: true },
    modelo: { type: String, required: true },
    calidad: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    returnedQty: { type: Number, default: 0, min: 0 },
    precioUSD: { type: Number, required: true, min: 0 },
    subtotalUSD: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const SaleSchema = new Schema<ISale>(
  {
    requestId: { type: String, maxlength: 100 },
    requestHash: { type: String, maxlength: 64 },
    orderNumber: { type: String, required: true, unique: true },
    clientName: { type: String, default: "" },
    items: {
      type: [SaleItemSchema],
      required: true,
      validate: [
        (v: ISaleItem[]) => v.length > 0,
        "La orden debe tener al menos 1 producto",
      ],
    },
    currency: { type: String, enum: ["USD", "CUP"], default: "USD" },
    exchangeRate: { type: Number, required: true, min: 1 },
    subtotalUSD: { type: Number, required: true, min: 0 },
    totalUSD: { type: Number, required: true, min: 0 },
    totalCUP: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"],
      default: "COMPLETED",
    },
    totalRefundedUSD: { type: Number, default: 0, min: 0 },
    totalRefundedCUP: { type: Number, default: 0, min: 0 },
    refunds: { type: [SaleRefundSchema], default: [] },
  },
  { timestamps: true },
);

SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ requestId: 1 }, { unique: true, sparse: true });

export const Sale: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);
