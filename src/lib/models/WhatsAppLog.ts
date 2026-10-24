import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWhatsAppLog extends Document {
  timestamp: Date;
  senderPhone: string;
  senderName?: string;
  role: 'admin' | 'client';
  userMessage: string;
  botReply: string;
  actionExecuted?: string;
  responseTimeMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const WhatsAppLogSchema = new Schema<IWhatsAppLog>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    senderPhone: { type: String, required: true, index: true },
    senderName: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'client'], required: true, index: true },
    userMessage: { type: String, required: true },
    botReply: { type: String, required: true },
    actionExecuted: { type: String, default: '' },
    responseTimeMs: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export const WhatsAppLog: Model<IWhatsAppLog> =
  mongoose.models.WhatsAppLog ||
  mongoose.model<IWhatsAppLog>('WhatsAppLog', WhatsAppLogSchema);
