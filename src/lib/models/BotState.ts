import mongoose, { Schema } from "mongoose";
const model = (name: string, schema: Schema) =>
  mongoose.models[name] || mongoose.model(name, schema);
const inbox = new Schema(
  {
    _id: String,
    phone: String,
    text: String,
    audio: Schema.Types.Mixed,
    provider: String,
    reply: String,
    status: String,
    attempts: { type: Number, default: 0 },
    leaseUntil: Date,
    expiresAt: Date,
    error: String,
  },
  { timestamps: true },
);
inbox.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BotInbox = model("BotInbox", inbox);
const outbound = new Schema(
  {
    _id: String,
    to: String,
    text: String,
    provider: { type: String, default: "bridge" },
    status: { type: String, default: "queued" },
    leaseUntil: Date,
    attempts: { type: Number, default: 0 },
    error: String,
    providerId: String,
    expiresAt: Date,
  },
  { timestamps: true },
);
outbound.index({ status: 1, createdAt: 1 });
outbound.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BotOutbound = model("BotOutbound", outbound);
const conversation = new Schema(
  {
    _id: String,
    paused: { type: Boolean, default: false },
    turns: [{ sender: String, text: String, time: Date }],
    quotedUSD: Number,
    quotedProductId: String,
    expiresAt: Date,
  },
  { timestamps: true },
);
conversation.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BotConversation = model("BotConversation", conversation);
const pending = new Schema(
  {
    _id: String,
    actor: String,
    actions: Schema.Types.Mixed,
    snapshot: Schema.Types.Mixed,
    rateSnapshot: Number,
    preview: String,
    expiresAt: Date,
    status: { type: String, default: "pending" },
  },
  { timestamps: true },
);
pending.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BotPending = model("BotPending", pending);
export const BotOperation = model(
  "BotOperation",
  new Schema(
    {
      _id: String,
      actor: String,
      actions: Schema.Types.Mixed,
      results: [String],
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },
    { timestamps: true },
  ),
);
