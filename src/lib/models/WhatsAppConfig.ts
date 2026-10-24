import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWhatsAppConfig extends Document {
  adminPhones: string[];
  blacklistedPhones: string[];
  botPhone: string;
  botStatus: 'online' | 'offline';
  lastPingAt?: Date;
}

const WhatsAppConfigSchema = new Schema<IWhatsAppConfig>(
  {
    adminPhones: { type: [String], default: ['5352031972'] },
    blacklistedPhones: { type: [String], default: [] },
    botPhone: { type: String, default: '' },
    botStatus: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastPingAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const WhatsAppConfig: Model<IWhatsAppConfig> =
  mongoose.models.WhatsAppConfig ||
  mongoose.model<IWhatsAppConfig>('WhatsAppConfig', WhatsAppConfigSchema);

export async function getWhatsAppConfig(): Promise<IWhatsAppConfig> {
  let config = await WhatsAppConfig.findOne();
  if (!config) {
    config = await WhatsAppConfig.create({
      adminPhones: ['5352031972'],
      blacklistedPhones: [],
      botPhone: process.env.BOT_PHONE || '',
      botStatus: 'online',
      lastPingAt: new Date(),
    });
  }
  return config;
}
