import connect from "@/lib/mongoose";
import mongoose, { Schema } from "mongoose";
const schema = new Schema({ _id: String, count: Number, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Limit =
  mongoose.models.RequestLimit || mongoose.model("RequestLimit", schema);
export async function allowRequest(
  scope: string,
  max: number,
  seconds: number,
) {
  await connect();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const doc = await Limit.findOneAndUpdate(
    { _id: scope + ":" + bucket },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return doc.count <= max;
}
