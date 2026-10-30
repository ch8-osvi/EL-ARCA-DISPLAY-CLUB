import { randomUUID } from "node:crypto";
import { Product } from "./models/Product";
import { StockHistory } from "./models/StockHistory";
import {
  assertProductNumbers,
  productCategory,
  productDisplayModel,
  productQuality,
} from "./categories";
export async function importCatalog(rows: any[]) {
  if (!rows.length || rows.length > 10000)
    throw new Error("Importa entre 1 y 10.000 productos");
  const existing = await Product.find({}).lean();
  const byId = new Map(existing.map((p) => [p.id, p]));
  const identity = (p: any) => [
    productCategory(p.categoria),
    p.marca.trim().toUpperCase(),
    productDisplayModel(p.modelo, p.categoria).toUpperCase(),
    productQuality(p.calidad.trim().toUpperCase()),
  ];
  const identityKey = (p: any) => JSON.stringify(identity(p));
  const byIdentity = new Map<string, (typeof existing)[number]>();
  const ambiguous = new Set<string>();
  for (const p of existing) {
    const key = identityKey(p);
    if (byIdentity.has(key)) ambiguous.add(key);
    byIdentity.set(key, p);
  }
  const movements: any[] = [];
  const seenIds = new Set<string>();
  const seenIdentities = new Map<string, boolean>();
  const operations = rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Fila ${index + 1}: producto inválido`);
    if (
      row.id !== undefined &&
      (typeof row.id !== "string" || !row.id.trim() || row.id.length > 200)
    )
      throw new Error(`Fila ${index + 1}: ID inválido`);
    const old = row.id ? byId.get(String(row.id)) : undefined;
    const categoria = productCategory(row.categoria ?? old?.categoria);
    if (old && categoria !== productCategory(old.categoria))
      throw new Error(`Fila ${index + 1}: el ID pertenece a otra categoría`);
    const p = {
      categoria,
      marca: String(row.marca || "VARIOS")
        .trim()
        .toUpperCase(),
      modelo: productDisplayModel(
        String(row.modelo || ""),
        row.categoria ?? old?.categoria,
      ).toUpperCase(),
      calidad: productQuality(
        String(row.calidad || "ORIGINAL")
          .trim()
          .toUpperCase(),
      ),
      precio: row.precio,
      stock: row.stock ?? 1,
    };
    if (!p.modelo || !p.calidad)
      throw new Error(`Fila ${index + 1}: falta modelo o calidad`);
    const key = identityKey(p);
    if (!old && ambiguous.has(key))
      throw new Error(
        `Fila ${index + 1}: hay varios productos iguales; incluye el ID exportado para identificarlo`,
      );
    const match = old || byIdentity.get(key);
    if (
      old &&
      identityKey(old) !== key &&
      byIdentity.has(key) &&
      byIdentity.get(key)?.id !== old.id
    )
      throw new Error(
        `Fila ${index + 1}: la identidad corresponde a otro producto`,
      );
    p.stock = row.stock ?? match?.stock ?? 1;
    assertProductNumbers(p.precio, p.stock);
    const id = match?.id || String(row.id || randomUUID());
    if (
      seenIds.has(id) ||
      (seenIdentities.has(key) &&
        !(
          old &&
          seenIdentities.get(key) &&
          ambiguous.has(key) &&
          identityKey(old) === key
        ))
    )
      throw new Error(`Fila ${index + 1}: producto duplicado en el archivo`);
    seenIds.add(id);
    seenIdentities.set(key, Boolean(old && identityKey(old) === key));
    const before = match?.stock ?? 0;
    if (p.stock !== before)
      movements.push({
        productId: id,
        productName: `[${categoria}] ${p.marca} ${p.modelo} ${p.calidad}`,
        type: p.stock > before ? "entrada" : "salida",
        qty: Math.abs(p.stock - before),
        stockBefore: before,
        stockAfter: p.stock,
        reason: "Ajuste por importación de catálogo",
      });
    return {
      updateOne: {
        filter: { id },
        update: { $set: p, $setOnInsert: { id, isHidden: false } },
        upsert: true,
      },
    };
  });
  await Product.bulkWrite(operations);
  if (movements.length) await StockHistory.insertMany(movements);
}
