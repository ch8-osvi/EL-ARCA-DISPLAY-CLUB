import mongoose, { Schema } from "mongoose";
import dbConnect from "@/lib/mongoose";
import {
  ELTOQUE_REFRESH_MS,
  ELTOQUE_STALE_MS,
  parseElToqueResponse,
} from "@/lib/eltoqueValidation";

const schema = new Schema({
  _id: String,
  rate: Number,
  providerDate: String,
  fetchedAt: Date,
  periodFrom: Date,
  periodTo: Date,
  nextAttemptAt: Date,
  lastError: String,
});
const State =
  mongoose.models.ElToqueApiState || mongoose.model("ElToqueApiState", schema);

export async function getElToqueRate() {
  await dbConnect();
  const now = new Date();
  try {
    await State.updateOne(
      { _id: "usd-cup" },
      { $setOnInsert: { nextAttemptAt: new Date(0) } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  // Atomic lease limits retries across server instances, including provider failures.
  const lease = await State.findOneAndUpdate(
    { _id: "usd-cup", nextAttemptAt: { $lte: now } },
    { $set: { nextAttemptAt: new Date(now.getTime() + 300000) } },
    { returnDocument: "after" },
  ).lean();
  if (lease) {
    try {
      if (!process.env.ELTOQUE_API_TOKEN) throw new Error("API no configurada");
      const response = await fetch("https://tasas.eltoque.com/v1/trmi", {
        headers: { Authorization: `Bearer ${process.env.ELTOQUE_API_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`elTOQUE HTTP ${response.status}`);
      const parsed = parseElToqueResponse(await response.json(), now);
      await State.updateOne(
        { _id: "usd-cup" },
        {
          $set: {
            ...parsed,
            fetchedAt: now,
            lastError: null,
            nextAttemptAt: new Date(now.getTime() + ELTOQUE_REFRESH_MS),
          },
        },
      );
    } catch {
      await State.updateOne(
        { _id: "usd-cup" },
        {
          $set: {
            lastError:
              "No se pudo verificar la API de elTOQUE. Se conserva la última referencia válida.",
          },
        },
      );
    }
  }
  const state = (await State.findById("usd-cup").lean()) as any;
  const ageMs = state?.fetchedAt
    ? Math.max(0, Date.now() - new Date(state.fetchedAt).getTime())
    : null;
  return {
    success: Number.isFinite(state?.rate) && state.rate >= 1,
    rate: state?.rate ?? null,
    source: "eltoque_api",
    updatedAt: state?.fetchedAt ?? null,
    providerDate: state?.providerDate ?? null,
    periodFrom: state?.periodFrom ?? null,
    periodTo: state?.periodTo ?? null,
    stale: ageMs === null || ageMs >= ELTOQUE_STALE_MS,
    ageMs,
    warning: state?.lastError ?? null,
  };
}
