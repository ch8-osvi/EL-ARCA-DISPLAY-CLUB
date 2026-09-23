import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IIgnoredDuplicate extends Document {
  pairId: string;
  productAId: string;
  productBId: string;
  ignoredAt: Date;
}

const IgnoredDuplicateSchema = new Schema<IIgnoredDuplicate>(
  {
    pairId: {
      type: String,
      required: true,
      unique: true,
    },
    productAId: {
      type: String,
      required: true,
    },
    productBId: {
      type: String,
      required: true,
    },
    ignoredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const IgnoredDuplicate: Model<IIgnoredDuplicate> =
  mongoose.models.IgnoredDuplicate || mongoose.model<IIgnoredDuplicate>('IgnoredDuplicate', IgnoredDuplicateSchema);
