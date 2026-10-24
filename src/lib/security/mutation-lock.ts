import mongoose, { Schema } from "mongoose";
const schema = new Schema({ _id: String, version: Number });
const MutationLock =
  mongoose.models.MutationLock || mongoose.model("MutationLock", schema);
export async function prepareMutationLock() {
  await MutationLock.updateOne(
    { _id: "business" },
    { $setOnInsert: { version: 0 } },
    { upsert: true },
  );
}
export async function acquireMutationLock() {
  await MutationLock.updateOne({ _id: "business" }, { $inc: { version: 1 } });
}
