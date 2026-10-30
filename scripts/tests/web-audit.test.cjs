const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSource } = require("./helpers/load-source.cjs");
const categories = loadSource("src/lib/categories.ts");

test("confirmación IA conserva BATERIA/REPUESTO al ejecutar altas y lotes", async () => {
  const captured = [];
  const { executeActions } = loadSource("src/lib/ai/actionExecutor.ts", {
    "@/lib/ai/adminTools": {
      executeAgregarProducto: async (row) => {
        captured.push(row);
        return { success: true, message: "ok" };
      },
      executeAgregarProductosLote: async (rows) => {
        captured.push(...rows);
        return { success: true, message: "ok" };
      },
    },
  });
  const product = {
    marca: "QA",
    modelo: "A12",
    calidad: "ORIGINAL",
    precio: 12,
    stock: 0,
  };
  await executeActions(
    "[ACCION:AGREGAR_PRODUCTO:" +
      JSON.stringify({ ...product, categoria: "BATERIA" }) +
      "]\n[ACCION:AGREGAR_LOTE:" +
      JSON.stringify({
        productos: [
          { ...product, categoria: "REPUESTO", modelo: "FLEX DE CARGA A12" },
        ],
      }) +
      "]",
  );
  assert.deepEqual(
    captured.map((row) => row.categoria),
    ["BATERIA", "REPUESTO"],
  );
  assert.equal(captured[0].stock, 0);
});

test("catálogo: la API normaliza calidades heredadas sin cambiar el documento ni sus cantidades", () => {
  const stored = {
    id: "old",
    modelo: "NOTE 10 PRO",
    categoria: "DISPLAY",
    calidad: "INCELL S/M",
    stock: 3,
    precio: 14,
  };
  assert.deepEqual(categories.catalogProduct(stored), {
    ...stored,
    calidad: "INCELL",
  });
  assert.equal(stored.calidad, "INCELL S/M");
  assert.equal(stored.stock, 3);
});

test("Excel: reconocer Original/Incell sin marco actualiza la referencia existente", async () => {
  let operations;
  const old = {
    id: "old",
    categoria: "DISPLAY",
    marca: "QA",
    modelo: "NOTE 10 PRO",
    calidad: "INCELL S/M",
    stock: 3,
  };
  const { importCatalog } = loadSource("src/lib/catalogImport.ts", {
    "./models/Product": {
      Product: {
        find: () => ({ lean: async () => [old] }),
        bulkWrite: async (rows) => {
          operations = rows;
        },
      },
    },
    "./models/StockHistory": { StockHistory: { insertMany: async () => {} } },
  });
  await importCatalog([
    { marca: "QA", modelo: "NOTE 10 PRO", calidad: "INCELL", precio: 14 },
  ]);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].updateOne.filter.id, "old");
  assert.equal(operations[0].updateOne.update.$set.calidad, "INCELL");
  assert.equal(operations[0].updateOne.update.$set.stock, 3);
  await assert.rejects(importCatalog([null]), /producto inválido/);
});

test("Excel: identidades ambiguas exigen el ID y no realizan escrituras parciales", async () => {
  let writes = 0;
  const base = {
    categoria: "DISPLAY",
    marca: "QA",
    modelo: "A12",
    calidad: "ORIGINAL",
    stock: 1,
  };
  const { importCatalog } = loadSource("src/lib/catalogImport.ts", {
    "./models/Product": {
      Product: {
        find: () => ({
          lean: async () => [
            { ...base, id: "a" },
            { ...base, id: "b", calidad: "ORIGINAL S/M" },
          ],
        }),
        bulkWrite: async () => {
          writes++;
        },
      },
    },
    "./models/StockHistory": { StockHistory: { insertMany: async () => {} } },
  });
  await assert.rejects(
    importCatalog([{ ...base, precio: 12 }]),
    /varios productos iguales/,
  );
  assert.equal(writes, 0);
});

test("Excel: un archivo exportado con IDs conserva por separado duplicados históricos", async () => {
  let operations;
  const base = {
    categoria: "DISPLAY",
    marca: "QA",
    modelo: "A12",
    calidad: "ORIGINAL",
    stock: 1,
  };
  const old = [
    { ...base, id: "a" },
    { ...base, id: "b", calidad: "ORIGINAL S/M" },
  ];
  const { importCatalog } = loadSource("src/lib/catalogImport.ts", {
    "./models/Product": {
      Product: {
        find: () => ({ lean: async () => old }),
        bulkWrite: async (rows) => {
          operations = rows;
        },
      },
    },
    "./models/StockHistory": { StockHistory: { insertMany: async () => {} } },
  });
  await importCatalog(old.map((row) => ({ ...row, precio: 12 })));
  assert.deepEqual(
    operations.map((row) => row.updateOne.filter.id),
    ["a", "b"],
  );
  assert.ok(operations.every((row) => row.updateOne.update.$set.stock === 1));
});

test("etiquetas: un borrador con listas o instantáneas corruptas no llega a React", () => {
  const { isLabelDraft, DEFAULT_SETTINGS } = loadSource(
    "src/lib/labelLayout.ts",
  );
  const valid = {
    version: 1,
    settings: DEFAULT_SETTINGS,
    boxes: [
      {
        uid: "b",
        note: "",
        lines: [
          {
            uid: "l",
            productId: "p",
            qty: "2",
            snapshot: { marca: "QA", modelo: "A12", calidad: "INCELL" },
          },
        ],
      },
    ],
  };
  assert.equal(isLabelDraft(valid), true);
  for (const value of [
    null,
    { version: 1, boxes: [null] },
    { ...valid, boxes: [{ uid: "b", note: "", lines: null }] },
    {
      ...valid,
      boxes: [
        {
          uid: "b",
          note: "",
          lines: [{ uid: "l", productId: "p", qty: "2", snapshot: null }],
        },
      ],
    },
  ])
    assert.equal(isLabelDraft(value), false);
});

test("duplicados: sin marco equivale a calidad base y se protegen marco y variantes Pro", () => {
  const { calculateDuplicateScore } = loadSource(
    "src/lib/duplicateDetector.ts",
  );
  const p = {
    id: "a",
    marca: "QA",
    modelo: "NOTE 10 PRO",
    categoria: "DISPLAY",
    calidad: "INCELL",
    precio: 14,
    stock: 1,
  };
  assert.equal(
    calculateDuplicateScore(p, { ...p, id: "b", calidad: "INCELL S/M" }).score,
    100,
  );
  assert.equal(
    calculateDuplicateScore(p, { ...p, id: "b", calidad: "INCELL C/M" }).score,
    0,
  );
  assert.equal(
    calculateDuplicateScore(p, { ...p, id: "b", modelo: "NOTE 10" }).score,
    0,
  );
});

test("fusión: ventas o devoluciones del secundario impiden cambiar el historial", async () => {
  let writes = 0;
  const p = {
    id: "p",
    marca: "QA",
    modelo: "NOTE 10 PRO",
    calidad: "INCELL",
    stock: 2,
    precio: 14,
  };
  const s = { ...p, id: "s" };
  const { executeFusionarProductos } = loadSource("src/lib/ai/adminTools.ts", {
    "@/lib/mongoose": async () => {},
    "@/lib/whatsapp/tools": {
      findProductSmart: async (id) => (id === "p" ? p : s),
    },
    "@/lib/models/Sale": {
      Sale: {
        exists: async () => true,
        updateMany: async () => {
          writes++;
        },
      },
    },
    "@/lib/models/Product": {
      Product: {
        deleteOne: async () => {
          writes++;
        },
      },
    },
    "@/lib/models/StockHistory": {
      StockHistory: {
        updateMany: async () => {
          writes++;
        },
      },
    },
  });
  const result = await executeFusionarProductos({
    queryPrincipal: "p",
    querySecundario: "s",
  });
  assert.equal(result.success, false);
  assert.match(result.message, /ventas o devoluciones/);
  assert.equal(writes, 0);
  assert.equal(p.stock, 2);
});

test("fusión: stock oculto nunca se incorpora automáticamente al catálogo público", async () => {
  const p = {
    id: "p",
    marca: "QA",
    modelo: "A12",
    calidad: "ORIGINAL",
    stock: 2,
    isHidden: false,
  };
  const { executeFusionarProductos } = loadSource("src/lib/ai/adminTools.ts", {
    "@/lib/mongoose": async () => {},
    "@/lib/whatsapp/tools": {
      findProductSmart: async (id) =>
        id === "p" ? p : { ...p, id: "s", isHidden: true },
    },
  });
  const result = await executeFusionarProductos({
    queryPrincipal: "p",
    querySecundario: "s",
  });
  assert.equal(result.success, false);
  assert.match(result.message, /visibilidades/);
});

test("sesión: fallo de base de datos devuelve 503 JSON y no un error sin controlar", async () => {
  const { requireAdmin } = loadSource("src/lib/security/admin.ts", {
    "@/lib/mongoose": async () => {
      throw new Error("private database details");
    },
    "./session": { authenticated: async () => true },
  });
  const result = await requireAdmin(
    new Request("https://elarca.test/api/stock"),
  );
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(await result.json()), /private database/);
});
