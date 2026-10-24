import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWhatsAppLog extends Document {
  messageId?: string;
  aiModel?: string;
  tokens?: number;
  status?: string;
  direction?: string;
  deletedAt?: Date;
  expiresAt?: Date;
  timestamp: Date;
  senderPhone: string;
  senderName?: string;
  role: "admin" | "client";
  userMessage: string;
  botReply: string;
  actionExecuted?: string;
  responseTimeMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const WhatsAppLogSchema = new Schema<IWhatsAppLog>(
  {
    messageId: { type: String, index: true },
    aiModel: { type: String, default: "" },
    tokens: { type: Number, default: 0 },
    status: { type: String, default: "completed" },
    direction: { type: String, default: "automatic" },
    deletedAt: { type: Date },
    expiresAt: { type: Date },
    timestamp: { type: Date, default: Date.now, index: true },
    senderPhone: { type: String, required: true, index: true },
    senderName: { type: String, default: "" },
    role: {
      type: String,
      enum: ["admin", "client"],
      required: true,
      index: true,
    },
    userMessage: { type: String, required: true },
    botReply: { type: String, required: true },
    actionExecuted: { type: String, default: "" },
    responseTimeMs: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);
WhatsAppLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WhatsAppLog: Model<IWhatsAppLog> =
  mongoose.models.WhatsAppLog ||
  mongoose.model<IWhatsAppLog>("WhatsAppLog", WhatsAppLogSchema);
