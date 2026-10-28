const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
function load(file) {
  const name = path.resolve(__dirname, "../..", file);
  const mod = new Module(name, module);
  mod.filename = name;
  mod.paths = module.paths;
  mod._compile(
    ts.transpileModule(fs.readFileSync(name, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    name,
  );
  return mod.exports;
}
const { getProductBadges } = load("src/lib/productBadges.ts");
const now = Date.parse("2026-10-28T12:00:00Z");
const { refundAmounts } = load("src/lib/refundAmounts.ts");
test("devoluciones: parcial y final suman exactamente lo cobrado en CUP, incluso con redondeo", () => {
  const item = { productId: "x", qty: 3, returnedQty: 0, subtotalUSD: 1 };
  const sale = {
    totalUSD: 1,
    totalCUP: 800,
    totalRefundedUSD: 0,
    totalRefundedCUP: 0,
    items: [item],
    refunds: [],
  };
  for (const expected of [
    { usd: 0.33, cup: 264 },
    { usd: 0.34, cup: 272 },
    { usd: 0.33, cup: 264 },
  ]) {
    const amount = refundAmounts(sale, item, 1);
    assert.deepEqual(amount, expected);
    item.returnedQty++;
    sale.totalRefundedUSD = Number(
      (sale.totalRefundedUSD + amount.usd).toFixed(2),
    );
    sale.totalRefundedCUP += amount.cup;
    sale.refunds.push({ productId: "x", refundUSD: amount.usd });
  }
  assert.equal(sale.totalRefundedUSD, sale.totalUSD);
  assert.equal(sale.totalRefundedCUP, sale.totalCUP);
});
test("devoluciones: respeta el total histórico y distribuye el residuo entre varios productos", () => {
  const items = [
    { productId: "a", qty: 1, subtotalUSD: 1 },
    { productId: "b", qty: 1, subtotalUSD: 2 },
  ];
  const sale = { totalUSD: 3, totalCUP: 2500, items };
  const first = refundAmounts(sale, items[0], 1);
  items[0].returnedQty = 1;
  const second = refundAmounts(sale, items[1], 1, first);
  assert.equal(first.cup + second.cup, 2500);
  assert.equal(first.usd + second.usd, 3);
  assert.deepEqual(
    refundAmounts({ totalUSD: 0, totalCUP: 0, items: [items[0]] }, items[0], 0),
    { usd: 0, cup: 0 },
  );
});
test("badges: nuevo solo durante 14 días; no acepta futuro ni fechas inválidas", () => {
  const badge = (createdAt) =>
    getProductBadges({ stock: 5, createdAt }, now).isNewArrival;
  assert.equal(badge(new Date(now)), true);
  assert.equal(badge(new Date(now - 14 * 86400000 + 1)), true);
  for (const date of [
    new Date(now + 1),
    new Date(now - 14 * 86400000),
    "invalida",
    undefined,
  ])
    assert.equal(badge(date), false);
});
test("badges: bajo stock de una o dos unidades; agotado nunca recibe promoción", () => {
  assert.equal(getProductBadges({ stock: 1 }).isLowStock, true);
  assert.equal(getProductBadges({ stock: 2 }).isLowStock, true);
  assert.equal(getProductBadges({ stock: 3 }).isLowStock, false);
  for (const stock of [0, -1, 1.5, NaN])
    assert.deepEqual(
      getProductBadges(
        { stock, isTopSeller: true, createdAt: new Date(now) },
        now,
      ),
      { isTopSeller: false, isLowStock: false, isNewArrival: false },
    );
  assert.equal(
    getProductBadges({ stock: 1, isTopSeller: "false" }).isTopSeller,
    false,
  );
});
const { createContactStore } = load("src/lib/contactStore.ts");
test("contacto: un fallo inicial no bloquea WhatsApp; deduplica, caduca y avisa del cambio", async () => {
  let calls = 0,
    clock = 0,
    notifications = 0;
  const store = createContactStore(
    async () => {
      if (++calls === 1) throw Error("offline");
      return {
        ok: true,
        json: async () => ({
          phone: calls === 2 ? "5350000001" : "5350000002",
        }),
      };
    },
    () => clock,
  );
  const unsubscribe = store.subscribe(() => notifications++);
  await store.refresh();
  assert.equal(store.getSnapshot(), "");
  await Promise.all(Array.from({ length: 100 }, () => store.refresh()));
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot(), "5350000001");
  assert.equal(notifications, 1);
  await store.refresh();
  assert.equal(calls, 2);
  clock = 30001;
  await store.refresh();
  assert.equal(store.getSnapshot(), "5350000002");
  assert.equal(notifications, 2);
  unsubscribe();
});
test("contacto: rechaza URL o número inválido, también recupera un fallo síncrono", async () => {
  let attempt = 0;
  const store = createContactStore(() => {
    if (++attempt === 1) throw Error("synchronous failure");
    return Promise.resolve({
      ok: true,
      json: async () => ({
        phone: attempt === 2 ? "javascript:alert(1)" : "5350000001",
      }),
    });
  });
  await store.refresh();
  await store.refresh();
  assert.equal(store.getSnapshot(), "");
  await store.refresh();
  assert.equal(store.getSnapshot(), "5350000001");
});
test("reintentos: huella estable al reordenar JSON; cantidades distintas no coinciden", () => {
  const { requestFingerprint } = load(
    "src/lib/security/request-fingerprint.ts",
  );
  assert.equal(
    requestFingerprint({ a: 1, b: { qty: 2, price: 3 } }),
    requestFingerprint({ b: { price: 3, qty: 2 }, a: 1 }),
  );
  assert.notEqual(
    requestFingerprint({ qty: 1 }),
    requestFingerprint({ qty: 2 }),
  );
});
