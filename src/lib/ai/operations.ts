import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import connect from "@/lib/mongoose";
import { BotPending, BotOperation } from "@/lib/models/BotState";
import { Product } from "@/lib/models/Product";
import { Sale } from "@/lib/models/Sale";
import { executeActions } from "./actionExecutor";
import { validateActions, type Action } from "./contracts";
import { findProductSmart } from "@/lib/whatsapp/tools";
import {
  prepareMutationLock,
  acquireMutationLock,
} from "@/lib/security/mutation-lock";
import { getActiveExchangeRate } from "@/lib/exchangeRate";

// Resolve names once, during preview. The confirmation operates on stable IDs.
export async function proposeActions(actor: string, input: Action[]) {
  const actions = validateActions(structuredClone(input));
  for (const action of actions) {
    const p = action.payload;
    for (const key of [
      "queryProducto",
      "modeloProducto",
      "queryPrincipal",
      "querySecundario",
    ]) {
      if (p[key]) {
        const product = await findProductSmart(p[key]);
        if (!product) throw new Error("No encontré el producto " + p[key]);
        p[key] = product.id;
      }
    }
    if (action.type === "CREAR_ORDEN")
      for (const item of p.items) {
        const product = await findProductSmart(item.productQuery);
        if (!product)
          throw new Error("Producto no encontrado: " + item.productQuery);
        item.productQuery = product.id;
      }
    if (action.type === "OCULTAR_LOTE")
      for (let i = 0; i < p.queries.length; i++) {
        const product = await findProductSmart(p.queries[i]);
        if (!product)
          throw new Error("Producto no encontrado: " + p.queries[i]);
        p.queries[i] = product.id;
      }
  }
  const ids = actions
    .flatMap((a) => [
      a.payload.queryProducto,
      a.payload.modeloProducto,
      a.payload.queryPrincipal,
      a.payload.querySecundario,
      ...(a.payload.queries || []),
      ...(a.payload.items || []).map((i: any) => i.productQuery),
    ])
    .filter(Boolean);
  const snapshot = await Product.find({ id: { $in: ids } })
    .select("id marca modelo calidad precio stock isHidden")
    .lean();
  const rate = await getActiveExchangeRate();
  let totals = "";
  for (const action of actions) {
    const p = action.payload;
    if (action.type === "CREAR_ORDEN" || action.type === "VENTA_RAPIDA") {
      if (!rate)
        throw new Error(
          "Configura la tasa del negocio antes de proponer una venta.",
        );
      const items =
        action.type === "CREAR_ORDEN"
          ? p.items
          : [{ productQuery: p.modeloProducto, qty: p.cantidad }];
      const total = items.reduce(
        (n: number, i: any) =>
          n +
          (i.precioOverride ??
            snapshot.find((s) => s.id === i.productQuery)?.precio ??
            0) *
            i.qty,
        0,
      );
      totals += `\nTotal propuesto: $${total.toFixed(2)} USD / ${(total * rate.rate).toFixed(2)} CUP. Tasa: ${rate.rate}.\n`;
    }
  }
  const code = randomBytes(4).toString("hex").toUpperCase();
  const preview =
    actions
      .map((a) => a.type + "\n" + JSON.stringify(a.payload, null, 2))
      .join("\n\n") +
    "\n\nProductos identificados:\n" +
    snapshot
      .map(
        (p) =>
          `${p.id}: ${p.marca} ${p.modelo} (${p.calidad}) — $${p.precio} USD; stock ${p.stock}`,
      )
      .join("\n") +
    totals;
  if (preview.length > 16000)
    throw new Error(
      "La propuesta es demasiado extensa para revisarla por WhatsApp. Divide el lote en grupos más pequeños.",
    );
  await BotPending.create({
    _id: code,
    actor,
    actions,
    snapshot,
    rateSnapshot: rate?.rate,
    preview,
    expiresAt: new Date(Date.now() + 10 * 60000),
  });
  return `Revisa esta propuesta. Todavía no se ha modificado ningún dato.\n\n${preview}\n\nPara ejecutarla escribe: CONFIRMAR ${code}\nCaduca en 10 minutos. Para descartarla: CANCELAR ${code}`;
}
export async function confirmActions(actor: string, code: string) {
  await connect();
  await prepareMutationLock();
  const prior = await BotOperation.findById(code).lean();
  if (prior) {
    if (prior.actor !== actor) throw new Error("Confirmación no válida");
    return prior.results.join("\n\n");
  }
  try {
    return await mongoose.connection.transaction(
      async () => {
        await acquireMutationLock();
        const pending = await BotPending.findOneAndUpdate(
          {
            _id: code,
            actor,
            status: "pending",
            expiresAt: { $gt: new Date() },
          },
          { $set: { status: "executing" } },
          { returnDocument: "after" },
        );
        if (!pending)
          throw new Error("Propuesta caducada, cancelada o ya procesada.");
        const actions = validateActions(pending.actions as Action[]);
        for (const original of pending.snapshot || []) {
          const current = await Product.findOne({ id: original.id }).lean();
          if (
            !current ||
            ["marca", "modelo", "calidad", "precio", "isHidden"].some(
              (k) => (current as any)[k] !== original[k],
            )
          )
            throw new Error(
              "El producto o su precio cambió desde la propuesta. Solicita una propuesta actualizada.",
            );
        }
        if (
          actions.some((a) => ["CREAR_ORDEN", "VENTA_RAPIDA"].includes(a.type))
        ) {
          const currentRate = await getActiveExchangeRate();
          if (currentRate?.rate !== pending.rateSnapshot)
            throw new Error("La tasa cambió. Solicita una nueva propuesta.");
        }
        const ids = actions
          .flatMap((a) => [
            a.payload.queryProducto,
            a.payload.modeloProducto,
            a.payload.queryPrincipal,
            a.payload.querySecundario,
            ...(a.payload.items || []).map((i: any) => i.productQuery),
          ])
          .filter(Boolean);
        const orders = actions
          .map((a) => a.payload.orderNumber)
          .filter(Boolean);
        const before = {
          products: await Product.find({ id: { $in: ids } }).lean(),
          sales: await Sale.find({ orderNumber: { $in: orders } }).lean(),
        };
        const tags = actions
          .map(
            (a) => "[ACCION:" + a.type + ":" + JSON.stringify(a.payload) + "]",
          )
          .join("\n");
        const result = await executeActions(tags);
        if (result.actionResults.length !== actions.length)
          throw new Error("No se pudieron ejecutar todas las acciones");
        const after = {
          products: await Product.find({ id: { $in: ids } }).lean(),
          sales: await Sale.find({ orderNumber: { $in: orders } }).lean(),
        };
        await BotOperation.create({
          _id: code,
          actor,
          actions,
          results: result.actionResults,
          before,
          after,
        });
        pending.status = "completed";
        await pending.save();
        return result.actionResults.join("\n\n");
      },
      { maxCommitTimeMS: 15000 },
    );
  } catch (err) {
    const saved = await BotOperation.findById(code).lean();
    if (saved?.actor === actor) return saved.results.join("\n\n");
    throw err;
  }
}
