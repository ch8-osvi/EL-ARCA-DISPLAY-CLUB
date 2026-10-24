import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWhatsAppConfig extends Document {
  adminPhones: string[];
  blacklistedPhones: string[];
  botPhone: string;
  botStatus: "online" | "offline";
  lastPingAt?: Date;
}

const WhatsAppConfigSchema = new Schema<IWhatsAppConfig>(
  {
    adminPhones: {
      type: [String],
      default: () =>
        process.env.ADMIN_PHONE_NUMBER
          ? [process.env.ADMIN_PHONE_NUMBER.replace(/\D/g, "")]
          : [],
    },
    blacklistedPhones: { type: [String], default: [] },
    botPhone: { type: String, default: "" },
    botStatus: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    lastPingAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

export const WhatsAppConfig: Model<IWhatsAppConfig> =
  mongoose.models.WhatsAppConfig ||
  mongoose.model<IWhatsAppConfig>("WhatsAppConfig", WhatsAppConfigSchema);

export async function getWhatsAppConfig(): Promise<IWhatsAppConfig> {
  const existing = await WhatsAppConfig.findOne();
  if (existing) return existing;
  return WhatsAppConfig.findOneAndUpdate(
    { _id: "000000000000000000000002" },
    {
      $setOnInsert: {
        adminPhones: process.env.ADMIN_PHONE_NUMBER
          ? [process.env.ADMIN_PHONE_NUMBER.replace(/\D/g, "")]
          : [],
        blacklistedPhones: [],
        botPhone: "",
        botStatus: "offline",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}
