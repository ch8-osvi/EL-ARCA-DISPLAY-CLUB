// Integration checks use a NEW database. They never connect to the business database name.
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module");
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  ts = require("typescript");
require("dotenv").config({ path: ".env.local", quiet: true });
if (process.env.MONGODB_DNS_SERVERS)
  require("node:dns").setServers(process.env.MONGODB_DNS_SERVERS.split(","));
const original = process.env.MONGODB_URI;
if (!original) throw new Error("MONGODB_URI requerido");
const database =
  "codex_bot_verification_" + crypto.randomBytes(6).toString("hex");
const uri = new URL(original);
uri.pathname = "/" + database;
process.env.MONGODB_URI = uri.toString();
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  cache.set(filename, m);
  const originalRequire = m.require.bind(m);
  m.require = (id) =>
    id.startsWith("@/")
      ? load("src/" + id.slice(2) + ".ts")
      : id.startsWith("./") &&
          fs.existsSync(path.resolve(path.dirname(filename), id + ".ts"))
        ? load(path.resolve(path.dirname(filename), id + ".ts"))
        : originalRequire(id);
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
async function main() {
  const mongoose = require("mongoose");
  const connect = load("src/lib/mongoose.ts").default;
  try {
    await connect();
    assert.equal(mongoose.connection.name, database);
    const { Product } = load("src/lib/models/Product.ts");
    const { Sale } = load("src/lib/models/Sale.ts");
    const { StockHistory } = load("src/lib/models/StockHistory.ts");
    const states = load("src/lib/models/BotState.ts");
    const rates = load("src/lib/exchangeRate.ts");
    const operations = load("src/lib/ai/operations.ts");
    const tools = load("src/lib/ai/adminTools.ts");
    const { atomicResponse } = load("src/lib/security/atomic-response.ts");
    for (const model of Object.values(mongoose.models)) await model.init();
    await rates.saveActiveExchangeRate(835);
    await Product.create({
      id: "test-a",
      marca: "SAMSUNG",
      modelo: "A12",
      calidad: "INCELL C/M",
      precio: 15.5,
      stock: 1,
    });
    const proposal = await operations.proposeActions("test-actor", [
      {
        type: "CREAR_ORDEN",
        payload: {
          clientName: "Test only",
          items: [
            { productQuery: "test-a", qty: 1 },
            { productQuery: "test-a", qty: 1 },
          ],
          currency: "USD",
          paid: true,
        },
      },
    ]);
    const code = proposal.match(/CONFIRMAR ([A-F0-9]{8})/)[1];
    await assert.rejects(operations.confirmActions("test-actor", code));
    assert.equal((await Product.findOne({ id: "test-a" })).stock, 1);
    assert.equal(await Sale.countDocuments(), 0);
    assert.equal(await StockHistory.countDocuments(), 0);
    console.log("PASS: rollback real de orden con descuento parcial");
    const first = await operations.proposeActions("test-actor", [
      {
        type: "VENTA_RAPIDA",
        payload: {
          cliente: "Test only",
          modeloProducto: "test-a",
          cantidad: 1,
          moneda: "USD",
          pagado: false,
        },
      },
    ]);
    const firstCode = first.match(/CONFIRMAR ([A-F0-9]{8})/)[1];
    const results = await Promise.all([
      operations.confirmActions("test-actor", firstCode),
      operations.confirmActions("test-actor", firstCode),
    ]);
    assert.equal(results[0], results[1]);
    assert.equal((await Product.findOne({ id: "test-a" })).stock, 0);
    assert.equal(await Sale.countDocuments(), 1);
    console.log(
      "PASS: confirmación concurrente descuenta y vende exactamente una vez",
    );
    const sale = await Sale.findOne();
    const cancel = await operations.proposeActions("test-actor", [
      {
        type: "ANULAR_ORDEN",
        payload: { orderNumber: sale.orderNumber, motivo: "Prueba aislada" },
      },
    ]);
    const cancelCode = cancel.match(/CONFIRMAR ([A-F0-9]{8})/)[1];
    await Promise.all([
      operations.confirmActions("test-actor", cancelCode),
      operations.confirmActions("test-actor", cancelCode),
    ]);
    assert.equal((await Product.findOne({ id: "test-a" })).stock, 1);
    console.log("PASS: anulación concurrente devuelve el stock una vez");
    await assert.rejects(operations.confirmActions("another-actor", firstCode));
    console.log("PASS: confirmación ligada al actor");
    const zero = await operations.proposeActions("test-actor", [
      {
        type: "AGREGAR_PRODUCTO",
        payload: {
          marca: "XIAOMI",
          modelo: "REDMI 9A",
          calidad: "INCELL C/M",
          precio: 12,
          stock: 0,
        },
      },
    ]);
    await operations.confirmActions(
      "test-actor",
      zero.match(/CONFIRMAR ([A-F0-9]{8})/)[1],
    );
    assert.equal((await Product.findOne({ modelo: "REDMI 9A" })).stock, 0);
    console.log("PASS: alta conserva stock cero");
    const bulk = await operations.proposeActions("test-actor", [
      {
        type: "AGREGAR_LOTE",
        payload: {
          productos: [2, 3].map((stock) => ({
            marca: "SAMSUNG",
            modelo: "A13",
            calidad: "INCELL C/M",
            precio: 14,
            stock,
          })),
        },
      },
    ]);
    await operations.confirmActions(
      "test-actor",
      bulk.match(/CONFIRMAR ([A-F0-9]{8})/)[1],
    );
    assert.equal(await Product.countDocuments({ modelo: "A13" }), 1);
    assert.equal((await Product.findOne({ modelo: "A13" })).stock, 5);
    console.log("PASS: lote repetido consolida 2+3 en un producto");
    const response = await atomicResponse(async () => {
      await Product.updateOne({ id: "test-a" }, { $inc: { stock: 20 } });
      return Response.json({ error: "Fallo simulado" }, { status: 409 });
    });
    assert.equal(response.status, 409);
    assert.equal((await Product.findOne({ id: "test-a" })).stock, 1);
    console.log("PASS: respuestas de error también revierten escrituras");
    // Exercise the actual protected routes against ONLY this temporary database.
    process.env.ADMIN_PHONE_NUMBER = "5350000099";
    process.env.ADMIN_SESSION_SECRET ||= crypto.randomBytes(32).toString("hex");
    const { createSession } = load("src/lib/security/session.ts");
    const { registerSession } = load("src/lib/security/admin.ts");
    const token = await createSession();
    await registerSession(token);
    const configRoute = load("src/app/api/whatsapp/admin/config/route.ts");
    const identity = load("src/lib/whatsapp/service.ts");
    const { WhatsAppConfig, getWhatsAppConfig } = load(
      "src/lib/models/WhatsAppConfig.ts",
    );
    await WhatsAppConfig.init();
    const configRequest = (action, phone) =>
      configRoute.POST(
        new Request("https://elarca.test/api/whatsapp/admin/config", {
          method: "POST",
          headers: {
            cookie: "el_arca_admin_session=" + token,
            origin: "https://elarca.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, phone }),
        }),
      );
    await getWhatsAppConfig();
    const additions = await Promise.all([
      configRequest("add_admin", "+53 5000 0001"),
      configRequest("add_admin", "5350000002"),
    ]);
    additions.forEach((r) => assert.equal(r.status, 200));
    assert.equal(await identity.isPhoneAuthorizedAdmin("5350000001"), true);
    assert.equal(await identity.isPhoneAuthorizedAdmin("5350000002"), true);
    await configRequest("add_admin", "5350000001");
    assert.equal(
      (await getWhatsAppConfig()).adminPhones.filter((p) => p === "5350000001")
        .length,
      1,
    );
    assert.equal(
      (await configRequest("add_blacklist", "5350000001")).status,
      400,
    );
    assert.equal(
      (await configRequest("remove_admin", "5350000099")).status,
      400,
    );
    assert.equal(
      (await configRequest("remove_admin", "5350000001")).status,
      200,
    );
    assert.equal(await identity.isPhoneAuthorizedAdmin("5350000001"), false);
    assert.equal(
      (await configRequest("add_blacklist", "5350000001")).status,
      200,
    );
    assert.equal(await identity.isPhoneBlacklisted("5350000001"), true);
    assert.equal((await configRequest("add_admin", "5350000001")).status, 400);
    assert.equal(
      (await configRequest("remove_blacklist", "5350000001")).status,
      200,
    );
    assert.equal(await identity.isPhoneBlacklisted("5350000001"), false);
    assert.equal((await configRequest("add_admin", "123")).status, 400);
    assert.equal((await configRequest("pause", "5350000001")).status, 200);
    assert.equal(
      (await states.BotConversation.findById("5350000001")).paused,
      true,
    );
    assert.equal((await configRequest("resume", "5350000001")).status, 200);
    assert.equal(
      (await states.BotConversation.findById("5350000001")).paused,
      false,
    );
    console.log(
      "PASS: rutas reales de administradores y bloqueados, concurrencia, duplicados, propietario, roles y pausa/reactivación",
    );
    console.log(
      "Integración completa en base aislada; no se cambiaron permisos del negocio.",
    );
  } finally {
    // Only this explicitly named, freshly generated database may be removed.
    if (
      mongoose.connection.readyState === 1 &&
      mongoose.connection.name === database &&
      /^codex_bot_verification_[a-f0-9]{12}$/.test(database)
    )
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exitCode = 1;
});
