const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function load(file, mocks = {}) {
  const filename = path.join(root, file);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const original = m.require.bind(m);
  const sourcedRequire = (id) => {
    const workspaceRoot = path.resolve(__dirname, "../..");
    const source = id.startsWith(".")
      ? path.resolve(path.dirname(filename), id + ".ts")
      : id.startsWith("@/")
        ? path.join(workspaceRoot, "src", id.slice(2) + ".ts")
        : null;
    return source && fs.existsSync(source)
      ? load(path.relative(workspaceRoot, source))
      : original(id);
  };
  m.require = (id) =>
    Object.hasOwn(mocks, id)
      ? mocks[id]
      : id === "@/lib/security/admin"
        ? { requireAdmin: async () => null }
        : id === "@/lib/security/atomic-response"
          ? { atomicResponse: async (run) => run() }
          : sourcedRequire(id);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const validation = load("src/lib/eltoqueValidation.ts");
const now = new Date("2026-10-22T12:00:00Z");
const good = {
  date: "2026-10-22",
  hour: 8,
  minutes: 0,
  seconds: 0,
  tasas: { USD: 825 },
};
test("valida USD/CUP y mantiene el período y reloj originales separados", () => {
  const d = validation.parseElToqueResponse(good, now);
  assert.equal(d.rate, 825);
  assert.equal(d.providerDate, "2026-10-22 08:00:00");
  assert.equal(d.periodTo - d.periodFrom, 86400000);
});
test("rechaza tasas no numéricas, infinitas, cero y negativas", () => {
  for (const USD of ["825", Infinity, NaN, 0, -1, null])
    assert.throws(() =>
      validation.parseElToqueResponse({ ...good, tasas: { USD } }, now),
    );
});
test("rechaza respuestas incompletas y fechas antiguas o imposibles", () => {
  for (const data of [
    null,
    {},
    { ...good, date: "2026-10-19" },
    { ...good, date: "2026-02-30" },
    { ...good, hour: 24 },
    { ...good, minutes: -1 },
  ])
    assert.throws(() => validation.parseElToqueResponse(data, now));
});
test("un fallo de API conserva el valor y la fecha válidos; caché evita consultas repetidas", async () => {
  let state = null;
  const State = {
    async updateOne(filter, update) {
      state ??= { _id: "usd-cup", ...update.$setOnInsert };
      Object.assign(state, update.$set);
    },
    findOneAndUpdate(filter, update) {
      const available = state.nextAttemptAt <= filter.nextAttemptAt.$lte;
      if (available) Object.assign(state, update.$set);
      return { lean: async () => (available ? { ...state } : null) };
    },
    findById() {
      return { lean: async () => ({ ...state }) };
    },
  };
  const api = load("src/lib/eltoque.ts", {
    mongoose: { models: { ElToqueApiState: State }, Schema: class {} },
    "@/lib/mongoose": async () => {},
    "@/lib/eltoqueValidation": validation,
  });
  const oldFetch = global.fetch;
  const oldToken = process.env.ELTOQUE_API_TOKEN;
  process.env.ELTOQUE_API_TOKEN = "test-token";
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        ...good,
        date: new Date().toISOString().slice(0, 10),
      }),
    };
  };
  try {
    const first = await api.getElToqueRate();
    assert.equal(first.rate, 825);
    assert.equal(first.stale, false);
    await api.getElToqueRate();
    assert.equal(calls, 1);
    state.nextAttemptAt = new Date(0);
    const originalDate = state.fetchedAt;
    global.fetch = async () => {
      throw new Error("timeout");
    };
    const fallback = await api.getElToqueRate();
    assert.equal(fallback.rate, 825);
    assert.equal(fallback.updatedAt, originalDate);
    assert.ok(fallback.warning);
    state.fetchedAt = new Date(Date.now() - 3 * 3600000);
    assert.equal((await api.getElToqueRate()).stale, true);
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.ELTOQUE_API_TOKEN;
    else process.env.ELTOQUE_API_TOKEN = oldToken;
  }
});
test("POST rechaza referencia antigua, datos inválidos y fallo de persistencia", async () => {
  const { NextResponse } = require("next/server");
  let saved = 0,
    fail = false;
  const route = load("src/app/api/exchange-rate/route.ts", {
    "next/server": { NextResponse },
    "@/lib/exchangeRate": {
      validExchangeRate: (v) =>
        typeof v === "number" && Number.isFinite(v) && v >= 1,
      saveActiveExchangeRate: async (rate) => {
        if (fail) throw new Error("DB failed");
        saved++;
        return { rate };
      },
    },
    "@/lib/eltoque": {
      getElToqueRate: async () => ({ success: true, stale: true, rate: 825 }),
    },
  });
  const req = (body) => ({ json: async () => body });
  assert.equal(
    (await route.POST(req({ rate: 825, source: "eltoque" }))).status,
    409,
  );
  for (const rate of [null, "825", 0, Infinity])
    assert.equal((await route.POST(req({ rate }))).status, 400);
  assert.equal(saved, 0);
  fail = true;
  const failed = await route.POST(req({ rate: 825 }));
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).success, false);
  fail = false;
  const ok = await route.POST(req({ rate: 825 }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rate, 825);
  assert.equal(saved, 1);
});
test("GET sin tasa activa devuelve no disponible y nunca 300/320", async () => {
  const { NextResponse } = require("next/server");
  const route = load("src/app/api/exchange-rate/route.ts", {
    "next/server": { NextResponse },
    "@/lib/exchangeRate": { getActiveExchangeRate: async () => null },
    "@/lib/eltoque": {},
  });
  const res = await route.GET(
    new Request("https://example.test/api/exchange-rate"),
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).rate, null);
});

test("una venta con tasa ausente o diferente se rechaza antes de tocar stock", async () => {
  const { NextResponse } = require("next/server");
  let activeRate = null,
    stockReads = 0;
  const route = load("src/app/api/sales/route.ts", {
    "next/server": { NextResponse },
    "@/lib/mongoose": async () => {},
    "@/lib/exchangeRate": { getActiveExchangeRate: async () => activeRate },
    "@/lib/models/Sale": { Sale: {} },
    "@/lib/models/Product": {
      Product: {
        findOne: async () => {
          stockReads++;
          throw new Error("No debe leer stock");
        },
      },
    },
    "@/lib/models/StockHistory": { StockHistory: {} },
    "@/lib/dateUtils": {},
  });
  const req = new Request("https://example.test/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      items: [{ productId: "test", qty: 1, precioUSD: 10 }],
      exchangeRate: 800,
    }),
  });
  assert.equal((await route.POST(req)).status, 503);
  activeRate = { rate: 825 };
  assert.equal((await route.POST(req)).status, 409);
  assert.equal(stockReads, 0);
});
test("la tasa canónica prevalece sobre registros heredados y el guardado es atómico", async () => {
  const canonical = { rate: 825 };
  let query;
  const service = load("src/lib/exchangeRate.ts", {
    "@/lib/mongoose": async () => {},
    "@/lib/models/ExchangeRate": {
      ExchangeRate: {
        findById: () => ({ lean: async () => canonical }),
        findOne: () => {
          throw new Error("No debe elegir otro registro");
        },
        findOneAndUpdate: async (...args) => {
          query = args;
          return { rate: 830 };
        },
      },
    },
  });
  assert.equal((await service.getActiveExchangeRate()).rate, 825);
  await service.saveActiveExchangeRate(830);
  assert.deepEqual(query[1], { $set: { rate: 830 } });
  assert.equal(query[2].upsert, true);
  assert.equal(query[2].runValidators, true);
});

test("middleware permite leer tasa pero rechaza cookie falsificada", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  const route = load("src/middleware.ts", {
    "next/server": { NextRequest, NextResponse },
    "@/lib/security/session": {
      SESSION_COOKIE: "el_arca_admin_session",
      validSession: async () => false,
      sameOrigin: () => true,
    },
  });
  assert.equal(
    (
      await route.middleware(
        new NextRequest("https://example.test/api/exchange-rate"),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await route.middleware(
        new NextRequest("https://example.test/api/exchange-rate", {
          method: "POST",
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await route.middleware(
        new NextRequest("https://example.test/api/exchange-rate", {
          method: "POST",
          headers: { cookie: "el_arca_admin_session=authenticated" },
        }),
      )
    ).status,
    401,
  );
});
