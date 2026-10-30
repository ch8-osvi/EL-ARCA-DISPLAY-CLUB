const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const crypto = require("node:crypto");
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, "../..", file);
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
    Object.hasOwn(mocks, id) ? mocks[id] : sourcedRequire(id);
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
const contracts = load("src/lib/ai/contracts.ts");
const bridge = load("src/lib/security/bridge.ts");
const { signedHeaders } = require("../../whatsapp-bridge/security");
const session = load("src/lib/security/session.ts");
const duplicate = load("src/lib/duplicateDetector.ts");
test("Excel actualizado conserva datos de exportaciones con estilos", () => {
  const styled = require("xlsx-js-style");
  const reader = require("xlsx");
  const workbook = styled.utils.book_new();
  const sheet = styled.utils.aoa_to_sheet([
    ["MODELO", "PRECIO"],
    ["A12", 15.5],
  ]);
  sheet.A1.s = { font: { bold: true } };
  styled.utils.book_append_sheet(workbook, sheet, "DISPLAYS");
  const bytes = styled.write(workbook, { type: "buffer", bookType: "xlsx" });
  const result = reader.read(bytes, { type: "buffer" });
  assert.deepEqual(reader.utils.sheet_to_json(result.Sheets.DISPLAYS), [
    { MODELO: "A12", PRECIO: 15.5 },
  ]);
});

test("sesiones firmadas: acepta sesión válida y rechaza falsificación, caducidad y firma alterada", async () => {
  process.env.ADMIN_SESSION_SECRET = "a".repeat(64);
  const token = await session.createSession();
  assert.equal(await session.validSession(token), true);
  for (const invalid of [
    "authenticated",
    token + "x",
    token.replace(/^\d+/, "1"),
    token.replace(/^\d+/, "9999999999"),
    "",
    "1.a.ff",
  ])
    assert.equal(await session.validSession(invalid), false);
  process.env.ADMIN_SESSION_SECRET = "b".repeat(64);
  assert.equal(await session.validSession(token), false);
});
test("CSRF: origen ajeno se rechaza", () => {
  assert.equal(
    session.sameOrigin(
      new Request("https://elarca.test/api", {
        headers: { origin: "https://evil.test" },
      }),
    ),
    false,
  );
  assert.equal(
    session.sameOrigin(
      new Request("https://elarca.test/api", {
        headers: { origin: "https://elarca.test" },
      }),
    ),
    true,
  );
});
test("firma puente: secreto obligatorio, integridad del cuerpo y ventana temporal", () => {
  const secret = "c".repeat(64),
    raw = JSON.stringify({ action: "pull" });
  process.env.WHATSAPP_BRIDGE_SECRET = secret;
  const req = (headers) =>
    new Request("https://elarca.test/api/whatsapp/bridge", {
      method: "POST",
      headers,
      body: raw,
    });
  assert.equal(bridge.verifyBridge(req({}), raw), false);
  assert.equal(bridge.verifyBridge(req(signedHeaders(raw, secret)), raw), true);
  assert.equal(
    bridge.verifyBridge(req(signedHeaders(raw, secret)), raw + " "),
    false,
  );
  assert.equal(
    bridge.verifyBridge(
      req(signedHeaders(raw, secret, Date.now() - 120000)),
      raw,
    ),
    false,
  );
  delete process.env.WHATSAPP_BRIDGE_SECRET;
  assert.equal(
    bridge.verifyBridge(req(signedHeaders(raw, secret)), raw),
    false,
  );
});
test("firma Meta valida autenticidad del POST independientemente del verify token", () => {
  process.env.WHATSAPP_APP_SECRET = "meta-test";
  const raw = "{}",
    signature = crypto
      .createHmac("sha256", "meta-test")
      .update(raw)
      .digest("hex");
  assert.equal(
    bridge.verifyMeta(
      new Request("https://test", {
        headers: { "x-hub-signature-256": "sha256=" + signature },
      }),
      raw,
    ),
    true,
  );
  assert.equal(bridge.verifyMeta(new Request("https://test"), raw), false);
});
test("esquemas conservan stock cero y rechazan cantidades fraccionarias, negativas, infinitas o cadenas", () => {
  const action = (stock) => [
    {
      type: "AGREGAR_PRODUCTO",
      payload: {
        marca: "SAMSUNG",
        modelo: "A12",
        calidad: "INCELL C/M",
        precio: 15.5,
        stock,
      },
    },
  ];
  assert.equal(contracts.validateActions(action(0))[0].payload.stock, 0);
  for (const value of [0.5, -1, Infinity, "2", null, undefined, 10001])
    assert.throws(() => contracts.validateActions(action(value)));
});
test("contrato de órdenes exige productQuery y no acepta el antiguo formato incompatible", () => {
  const payload = {
    clientName: "Prueba",
    items: [{ modelo: "A12", qty: 1 }],
    currency: "USD",
    paid: true,
  };
  assert.throws(() =>
    contracts.validateActions([{ type: "CREAR_ORDEN", payload }]),
  );
  payload.items = [{ productQuery: "p1", qty: 1 }];
  assert.doesNotThrow(() =>
    contracts.validateActions([{ type: "CREAR_ORDEN", payload }]),
  );
});
test("esquemas rechazan acciones desconocidas, campos extra y pago ambiguo", () => {
  assert.throws(() =>
    contracts.validateActions([{ type: "BORRAR_TODO", payload: {} }]),
  );
  assert.throws(() =>
    contracts.validateActions([
      {
        type: "ACTUALIZAR_PRECIO",
        payload: { queryProducto: "p1", nuevoPrecioUSD: 15, admin: true },
      },
    ]),
  );
  assert.throws(() =>
    contracts.validateActions([
      {
        type: "VENTA_RAPIDA",
        payload: {
          cliente: "X",
          modeloProducto: "p1",
          cantidad: 1,
          moneda: "USD",
          pagado: "false",
        },
      },
    ]),
  );
});
test("duplicados excluyen variantes Pro, 4G/5G y calidades o marcos diferentes", () => {
  const p = (modelo, calidad = "INCELL C/M") => ({
    marca: "XIAOMI",
    modelo,
    calidad,
  });
  assert.equal(
    duplicate.calculateDuplicateScore(
      p("REDMI NOTE 11"),
      p("REDMI NOTE 11 PRO"),
    ).score,
    0,
  );
  assert.equal(
    duplicate.calculateDuplicateScore(
      p("REDMI NOTE 11"),
      p("REDMI NOTE 11", "ORIGINAL S/M"),
    ).score,
    0,
  );
  assert.equal(
    duplicate.calculateDuplicateScore(p("REDMI NOTE 11"), p("REDMI NOTE 11"))
      .score,
    100,
  );
});
test("parser de acciones soporta llaves y comillas dentro de cadenas JSON", () => {
  const actions = load("src/lib/ai/actionExecutor.ts", {
    "@/lib/ai/adminTools": {},
  });
  const payload = { queryProducto: "p1", nuevoModelo: 'A12 {nuevo} "modelo"' };
  const tags = actions.extractActionTags(
    "[ACCION:MODIFICAR_PRODUCTO:" + JSON.stringify(payload) + "]",
  );
  assert.equal(tags.length, 1);
  assert.deepEqual(JSON.parse(tags[0].jsonStr), payload);
});
test("búsqueda de escritura no elige silenciosamente el producto de mayor stock", async () => {
  const tools = load("src/lib/whatsapp/tools.ts", {
    "@/lib/security/validation": { escapeRegex: (s) => s },
    "@/lib/exchangeRate": {},
    "@/lib/mongoose": async () => {},
    "@/lib/models/Product": {
      Product: {
        findOne: async () => null,
        find: () => ({
          limit: async () => [
            { id: "a", modelo: "A12", calidad: "INCELL", marca: "SAMSUNG" },
            { id: "b", modelo: "A12", calidad: "OLED", marca: "SAMSUNG" },
          ],
        }),
      },
    },
    "@/lib/models/Sale": {},
    "@/lib/models/StockHistory": {},
    "@/lib/dateUtils": {},
  });
  await assert.rejects(tools.findProductSmart("A12"), /ambiguo/);
});
test("ajuste negativo usa condición atómica y no registra éxito si falta stock", async () => {
  let filter,
    movements = 0;
  const tools = load("src/lib/whatsapp/tools.ts", {
    "@/lib/security/validation": { escapeRegex: (s) => s },
    "@/lib/exchangeRate": {},
    "@/lib/mongoose": async () => {},
    "@/lib/models/Product": {
      Product: {
        findOne: async () => ({ _id: "a", id: "p1", stock: 1 }),
        findOneAndUpdate: async (f) => {
          filter = f;
          return null;
        },
      },
    },
    "@/lib/models/Sale": {},
    "@/lib/models/StockHistory": {
      StockHistory: {
        create: async () => {
          movements++;
        },
      },
    },
    "@/lib/dateUtils": {},
  });
  const result = await tools.executeAjustarStockProducto("p1", -2);
  assert.equal(filter.stock.$gte, 2);
  assert.equal(result.success, false);
  assert.equal(movements, 0);
});
test("Gemini usa JSON Schema, no envía secreto en la URL y devuelve llamadas estructuradas", async () => {
  const ai = load("src/lib/ai/gemini.ts", { "./contracts": contracts });
  process.env.GEMINI_API_KEY = "test-key";
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.ok(!url.includes("test-key"));
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    const body = JSON.parse(options.body);
    assert.ok(body.tools[0].functionDeclarations[0].parametersJsonSchema);
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  functionCall: {
                    name: "ACTUALIZAR_PRECIO",
                    args: { queryProducto: "p1", nuevoPrecioUSD: 15.5 },
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: { totalTokenCount: 42 },
      }),
    };
  };
  try {
    const result = await ai.queryGemini(
      "test",
      [{ role: "user", parts: [{ text: "test" }] }],
      true,
    );
    assert.equal(result.actions[0].payload.nuevoPrecioUSD, 15.5);
    assert.equal(result.tokens, 42);
  } finally {
    global.fetch = oldFetch;
  }
});

test("Gemini usa una versión fija y respaldo tras timeout sin ejecutar acciones", async () => {
  const ai = load("src/lib/ai/gemini.ts", { "./contracts": contracts });
  const oldFetch = global.fetch;
  const previousModels = process.env.GEMINI_MODELS;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODELS;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1)
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Disponible" }] },
          },
        ],
        usageMetadata: { totalTokenCount: 25 },
      }),
    };
  };
  try {
    const result = await ai.queryGemini(
      "Catálogo",
      [{ role: "user", parts: [{ text: "Pantalla A12" }] }],
      false,
    );
    assert.match(calls[0].url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.match(calls[1].url, /gemini-3\.6-flash:generateContent$/);
    for (const call of calls) {
      assert.equal(
        call.body.generationConfig.thinkingConfig.thinkingLevel,
        "minimal",
      );
      assert.equal(call.body.tools, undefined);
    }
    assert.equal(result.model, "gemini-3.6-flash");
    assert.equal(result.text, "Disponible");
    assert.deepEqual(result.actions, []);
  } finally {
    global.fetch = oldFetch;
    if (previousModels === undefined) delete process.env.GEMINI_MODELS;
    else process.env.GEMINI_MODELS = previousModels;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("Gemini respeta modelos configurados sin enviar parámetros de razonamiento incompatibles", async () => {
  const ai = load("src/lib/ai/gemini.ts", { "./contracts": contracts });
  const oldFetch = global.fetch;
  const previousModels = process.env.GEMINI_MODELS;
  process.env.GEMINI_MODELS = "custom-model";
  global.fetch = async (url, options) => {
    assert.match(url, /custom-model:generateContent$/);
    assert.equal(
      JSON.parse(options.body).generationConfig.thinkingConfig,
      undefined,
    );
    return {
      ok: true,
      json: async () => ({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "OK" }] } },
        ],
      }),
    };
  };
  try {
    assert.equal((await ai.queryGemini("test", [], false)).text, "OK");
  } finally {
    global.fetch = oldFetch;
    if (previousModels === undefined) delete process.env.GEMINI_MODELS;
    else process.env.GEMINI_MODELS = previousModels;
  }
});
