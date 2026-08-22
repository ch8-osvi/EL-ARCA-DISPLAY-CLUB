import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVisit extends Document {
  visitorId: string;
  page: string;
  referrer?: string;
  createdAt: Date;
}

const VisitSchema = new Schema<IVisit>(
  {
    visitorId: { type: String, required: true, index: true },
    page: { type: String, default: '/' },
    referrer: { type: String },
  },
  { timestamps: true }
);

export const Visit: Model<IVisit> =
  mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);
