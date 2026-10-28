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
      ? id.endsWith(".json")
        ? originalRequire(path.resolve("src/" + id.slice(2)))
        : load("src/" + id.slice(2) + ".ts")
      : id.startsWith(".") &&
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
    // Exercise real category routes against this disposable database only.
    const productRoute = load("src/app/api/products/route.ts");
    const apiRequest = (pathname, body) =>
      new Request("https://elarca.test" + pathname, {
        method: "POST",
        headers: {
          cookie: "el_arca_admin_session=" + token,
          origin: "https://elarca.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    await Product.collection.insertOne({
      id: "legacy-cat",
      marca: "SAMSUNG",
      modelo: "A50",
      calidad: "ORIGINAL",
      precio: 9,
      stock: 3,
      isHidden: false,
    });
    await Product.create({
      id: "battery-cat",
      categoria: "BATERIA",
      marca: "SAMSUNG",
      modelo: "A50",
      calidad: "ORIGINAL",
      precio: 6,
      stock: 4,
    });
    const displayRows = await (
      await productRoute.GET(
        new Request("https://elarca.test/api/products?categoria=DISPLAY"),
      )
    ).json();
    assert.ok(
      displayRows.products.some(
        (p) => p.id === "legacy-cat" && p.categoria === "DISPLAY",
      ),
    );
    assert.ok(!displayRows.products.some((p) => p.id === "battery-cat"));
    const batteryRows = await (
      await productRoute.GET(
        new Request("https://elarca.test/api/products?categoria=BATERIA"),
      )
    ).json();
    assert.deepEqual(
      batteryRows.products.map((p) => p.id),
      ["battery-cat"],
    );
    assert.equal(
      (
        await productRoute.GET(
          new Request("https://elarca.test/api/products?categoria=UNKNOWN"),
        )
      ).status,
      400,
    );
    const addZero = await productRoute.POST(
      apiRequest("/api/products", {
        action: "add",
        product: {
          categoria: "TAPA",
          marca: "SAMSUNG",
          modelo: "A50",
          calidad: "ORIGINAL",
          precio: 3,
          stock: 0,
        },
      }),
    );
    assert.equal(addZero.status, 200);
    assert.equal((await addZero.json()).product.stock, 0);
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", {
            action: "add",
            product: { modelo: "bad-stock", precio: 1, stock: 0.5 },
          }),
        )
      ).status,
      400,
    );
    let result = await productRoute.POST(
      apiRequest("/api/products", {
        action: "sync",
        initialList: [
          { marca: "SAMSUNG", modelo: "A50", calidad: "ORIGINAL", precio: 10 },
        ],
      }),
    );
    assert.equal(result.status, 200);
    assert.equal((await Product.findOne({ id: "legacy-cat" })).stock, 3);
    assert.equal((await Product.findOne({ id: "legacy-cat" })).precio, 10);
    assert.equal((await Product.findOne({ id: "battery-cat" })).stock, 4);
    const movementsBefore = await StockHistory.countDocuments();
    result = await productRoute.POST(
      apiRequest("/api/products", {
        action: "sync",
        initialList: [
          {
            id: "legacy-cat",
            marca: "SAMSUNG",
            modelo: "A50",
            calidad: "ORIGINAL",
            precio: 99,
            stock: 1,
          },
          { modelo: "INVALID", precio: 1, stock: -1 },
        ],
      }),
    );
    assert.equal(result.status, 400);
    assert.equal((await Product.findOne({ id: "legacy-cat" })).precio, 10);
    assert.equal(await StockHistory.countDocuments(), movementsBefore);
    result = await productRoute.POST(
      apiRequest("/api/products", {
        action: "update",
        id: "battery-cat",
        stock: 2,
      }),
    );
    assert.equal(result.status, 200);
    assert.equal(
      (await StockHistory.findOne({ productId: "battery-cat" })).stockAfter,
      2,
    );
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", {
            action: "delete-permanent",
            id: "battery-cat",
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", { action: "restore" }),
        )
      ).status,
      409,
    );
    const saleRoute = load("src/app/api/sales/route.ts");
    const saleResponse = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "create",
        clientName: "Category verification only",
        items: [
          {
            productId: "battery-cat",
            qty: 1,
            precioUSD: 6,
            categoria: "DISPLAY",
          },
        ],
        currency: "USD",
        exchangeRate: 835,
        paid: true,
      }),
    );
    assert.equal(saleResponse.status, 200);
    const savedSale = await Sale.findOne({
      clientName: "Category verification only",
    });
    assert.equal(savedSale.items[0].categoria, "BATERIA");
    assert.equal((await Product.findOne({ id: "battery-cat" })).stock, 1);
    assert.equal((await Product.findOne({ id: "legacy-cat" })).stock, 3);
    console.log(
      "PASS: categorías heredadas y nuevas, cero stock, importación no destructiva y rollback, trazabilidad, protección del historial y categoría real en ventas",
    );
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
    const inbox = load("src/lib/whatsapp/inbox.ts");
    const { WhatsAppLog } = load("src/lib/models/WhatsAppLog.ts");
    const { advanceDelivery } = load("src/lib/whatsapp/delivery.ts");
    const gemini = load("src/lib/ai/gemini.ts");
    let customerSystem = "";
    gemini.queryGemini = async (system) => {
      customerSystem = system;
      return {
        text: "Respuesta de prueba",
        tokens: 1,
        actions: [],
        model: "integration-mock",
      };
    };
    await identity.processWhatsAppAiMessage(
      "¿Pantalla Samsung A50?",
      "5350000010",
    );
    let context = JSON.parse(customerSystem.split("DATOS VERIFICADOS:\n")[1]);
    assert.equal(context.productos.length, 1);
    assert.equal(context.productos[0].id, "legacy-cat");
    assert.equal(context.productos[0].categoria, "DISPLAY");
    await identity.processWhatsAppAiMessage("Ahora Redmi 9A", "5350000010");
    context = JSON.parse(customerSystem.split("DATOS VERIFICADOS:\n")[1]);
    assert.equal(context.productos.length, 1);
    assert.equal(context.productos[0].modelo, "REDMI 9A");
    assert.equal(context.productos[0].disponibilidad, "Agotado");
    await identity.processWhatsAppAiMessage("Ahora Pixel 99Z", "5350000010");
    context = JSON.parse(customerSystem.split("DATOS VERIFICADOS:\n")[1]);
    assert.equal(context.productos.length, 0);
    await states.BotConversation.updateOne(
      { _id: "5350000010" },
      { $set: { quotedUSD: 99, quotedProductId: "legacy-cat" } },
    );
    const categoryQuestion = await identity.processWhatsAppAiMessage(
      "Precio Samsung A50",
      "5350000010",
    );
    assert.match(categoryQuestion, /pantallas/);
    assert.match(categoryQuestion, /baterías/);
    assert.doesNotMatch(categoryQuestion, /tapas/);
    assert.equal(
      (await states.BotConversation.findById("5350000010")).quotedUSD,
      undefined,
    );
    assert.equal(
      (
        await tools.executeFusionarProductos({
          queryPrincipal: "legacy-cat",
          querySecundario: "battery-cat",
        })
      ).success,
      false,
    );
    const batteryAdd = await atomicResponse(async () =>
      Response.json(
        await tools.executeAgregarProducto({
          categoria: "BATERIA",
          marca: "SAMSUNG",
          modelo: "A20 ORIGINAL",
          calidad: "ORIGINAL",
          precio: 5,
          stock: 0,
        }),
      ),
    );
    assert.equal((await batteryAdd.json()).success, true);
    assert.ok(
      await Product.exists({
        categoria: "BATERIA",
        modelo: "A20 ORIGINAL",
        calidad: "ORIGINAL",
      }),
    );
    console.log(
      "PASS: IA consulta categoría y modelo exactos, cambio de modelo sin arrastre, aclaración sin cotización anterior y altas/fusiones seguras por categoría",
    );
    gemini.queryGemini = async () => ({
      text: "Tenemos **Redmi 9A**.",
      tokens: 10,
      actions: [],
      model: "integration-mock",
    });
    const incoming = await inbox.receiveMessage(
      "incoming-test",
      "5350000001",
      "Consulta Redmi 9A",
      "bridge",
      undefined,
      "123456789012345@lid",
    );
    let row = await WhatsAppLog.findOne({ messageId: incoming });
    assert.equal(row.status, "received");
    assert.equal(row.role, "client");
    assert.match(row.botReply, /Pendiente/);
    assert.equal(await inbox.processNextMessage(), true);
    const outgoing = await states.BotOutbound.findById("reply:" + incoming);
    assert.equal(outgoing.chatJid, "123456789012345@lid");
    assert.equal(
      outgoing.text,
      "Tenemos *Redmi 9A*.\n\n_Asistente automático de El Arca Display Club_",
    );
    await inbox.receiveMessage(
      "incoming-test",
      "5350000001",
      "Consulta Redmi 9A",
      "bridge",
      undefined,
      "123456789012345@lid",
    );
    assert.equal(await WhatsAppLog.countDocuments({ messageId: incoming }), 1);
    assert.equal(
      (await WhatsAppLog.findOne({ messageId: incoming })).status,
      "queued",
    );
    await states.BotOutbound.updateOne(
      { _id: outgoing._id },
      { $set: { leaseUntil: new Date(Date.now() + 90000), status: "sending" } },
    );
    await advanceDelivery(outgoing._id, "submitted", "provider-test");
    assert.ok((await states.BotOutbound.findById(outgoing._id)).leaseUntil);
    await advanceDelivery(outgoing._id, "delivered", "provider-test");
    await advanceDelivery(outgoing._id, "submitted", "provider-test");
    await advanceDelivery(outgoing._id, "sent", "provider-test");
    assert.equal(
      (await states.BotOutbound.findById(outgoing._id)).status,
      "delivered",
    );
    assert.equal(
      (await WhatsAppLog.findOne({ messageId: incoming })).status,
      "delivered",
    );
    await advanceDelivery(outgoing._id, "read", "provider-test");
    await advanceDelivery(outgoing._id, "failed", "provider-test");
    assert.equal(
      (await WhatsAppLog.findOne({ messageId: incoming })).status,
      "read",
    );
    await states.BotOutbound.updateOne(
      { _id: outgoing._id },
      { $set: { status: "sending" } },
    );
    await WhatsAppLog.updateOne(
      { messageId: incoming },
      { $set: { status: "queued" } },
    );
    await Promise.all([
      advanceDelivery(outgoing._id, "sent", "provider-test"),
      advanceDelivery(outgoing._id, "delivered", "provider-test"),
      advanceDelivery(outgoing._id, "read", "provider-test"),
    ]);
    assert.equal(
      (await states.BotOutbound.findById(outgoing._id)).status,
      "read",
    );
    assert.equal(
      (await WhatsAppLog.findOne({ messageId: incoming })).status,
      "read",
    );
    assert.equal(
      await identity.isPhoneAuthorizedAdmin("123456789012345"),
      false,
    );
    console.log(
      "PASS: entrada visible antes de IA, registro único, respuesta al LID sin permisos extra, formato WhatsApp y recibos que nunca retroceden",
    );
    // Permanent removal must retain commercial evidence and never recreate stock.
    await Product.create({
      id: "delete-battery",
      categoria: "BATERIA",
      marca: "SAMSUNG",
      modelo: "A99 PRUEBA",
      calidad: "ORIGINAL",
      precio: 9,
      stock: 4,
    });
    await StockHistory.create({
      productId: "delete-battery",
      productName: "BATERIA SAMSUNG A99 PRUEBA",
      type: "entrada",
      qty: 4,
      stockBefore: 0,
      stockAfter: 4,
      reason: "Fixture aislada",
    });
    const deletionSaleResponse = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "create",
        clientName: "Deletion verification only",
        items: [{ productId: "delete-battery", qty: 2, precioUSD: 9 }],
        currency: "USD",
        exchangeRate: 835,
        paid: true,
      }),
    );
    assert.equal(deletionSaleResponse.status, 200);
    const deletionSale = (await deletionSaleResponse.json()).sale;
    const historyBeforeDelete = await StockHistory.countDocuments({
      productId: "delete-battery",
    });
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", {
            action: "delete-permanent",
            id: "delete-battery",
            confirmPermanent: "true",
          }),
        )
      ).status,
      409,
    );
    assert.equal((await Product.findOne({ id: "delete-battery" })).stock, 2);
    const deleted = await productRoute.POST(
      apiRequest("/api/products", {
        action: "delete-permanent",
        id: "delete-battery",
        confirmPermanent: true,
      }),
    );
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).retainedHistory, true);
    assert.equal(await Product.exists({ id: "delete-battery" }), null);
    assert.equal(
      await StockHistory.countDocuments({ productId: "delete-battery" }),
      historyBeforeDelete + 1,
    );
    const closingMovement = await StockHistory.findOne({
      productId: "delete-battery",
      reason: /Eliminación definitiva/,
    });
    assert.equal(closingMovement.stockBefore, 2);
    assert.equal(closingMovement.stockAfter, 0);
    assert.equal(
      (await Sale.findById(deletionSale._id)).items[0].categoria,
      "BATERIA",
    );
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", {
            action: "delete-permanent",
            id: "delete-battery",
            confirmPermanent: true,
          }),
        )
      ).status,
      404,
    );
    const salesBeforeInvalidSale = await Sale.countDocuments();
    assert.equal(
      (
        await saleRoute.POST(
          apiRequest("/api/sales", {
            action: "create",
            items: [{ productId: "delete-battery", qty: 1, precioUSD: 9 }],
            currency: "USD",
            exchangeRate: 835,
            paid: true,
          }),
        )
      ).status,
      404,
    );
    assert.equal(await Sale.countDocuments(), salesBeforeInvalidSale);
    const retiredRefund = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "refund",
        saleId: deletionSale._id,
        reason: "Devolución de prueba tras borrar SKU",
        returns: [
          { productId: "delete-battery", qty: 1, destination: "stock" },
        ],
      }),
    );
    assert.equal(retiredRefund.status, 200);
    const retiredRefundData = await retiredRefund.json();
    assert.equal(retiredRefundData.refundLogs[0].destination, "retirado");
    assert.equal(retiredRefundData.totalRefundUSD, 9);
    assert.match(retiredRefundData.message, /fuera del inventario/);
    assert.equal(await Product.exists({ id: "delete-battery" }), null);
    assert.equal(
      (
        await StockHistory.findOne({
          productId: "delete-battery",
          type: "retirado",
        })
      ).stockAfter,
      0,
    );
    assert.equal(
      (
        await saleRoute.POST(
          apiRequest("/api/sales", {
            action: "refund",
            saleId: deletionSale._id,
            reason: "Cantidad duplicada",
            returns: [
              { productId: "delete-battery", qty: 2, destination: "stock" },
            ],
          }),
        )
      ).status,
      400,
    );
    assert.equal((await Sale.findById(deletionSale._id)).totalRefundedUSD, 9);
    const retiredCancellation = await operations.proposeActions("test-actor", [
      {
        type: "ANULAR_ORDEN",
        payload: {
          orderNumber: deletionSale.orderNumber,
          motivo: "Prueba de producto eliminado",
        },
      },
    ]);
    const retiredCode = retiredCancellation.match(/CONFIRMAR ([A-F0-9]{8})/)[1];
    assert.match(
      await operations.confirmActions("test-actor", retiredCode),
      /Fuera de inventario/,
    );
    await operations.confirmActions("test-actor", retiredCode);
    assert.equal((await Sale.findById(deletionSale._id)).status, "CANCELLED");
    assert.equal(
      (await Sale.findById(deletionSale._id)).items[0].returnedQty,
      2,
    );
    assert.equal(
      await StockHistory.countDocuments({
        productId: "delete-battery",
        type: "retirado",
      }),
      2,
    );
    assert.equal(await Product.exists({ id: "delete-battery" }), null);
    assert.equal((await Product.findOne({ id: "legacy-cat" })).stock, 3);
    console.log(
      "PASS: borrado confirmado con ventas e historial conservados, stock cerrado, devolución y anulación sin recrear productos ni duplicar unidades",
    );

    await Product.create({
      id: "delete-merma",
      categoria: "TAPA",
      marca: "SAMSUNG",
      modelo: "A99 PRUEBA",
      calidad: "ORIGINAL",
      precio: 3,
      stock: 1,
    });
    const wasteSaleResponse = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "create",
        clientName: "Deleted waste fixture",
        items: [{ productId: "delete-merma", qty: 1, precioUSD: 3 }],
        currency: "USD",
        exchangeRate: 835,
        paid: true,
      }),
    );
    assert.equal(wasteSaleResponse.status, 200);
    const wasteSale = (await wasteSaleResponse.json()).sale;
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", {
            action: "delete-permanent",
            id: "delete-merma",
            confirmPermanent: true,
          }),
        )
      ).status,
      200,
    );
    const wasteRefund = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "refund",
        saleId: wasteSale._id,
        reason: "Merma de SKU eliminado",
        returns: [{ productId: "delete-merma", qty: 1, destination: "merma" }],
      }),
    );
    assert.equal(wasteRefund.status, 200);
    assert.equal((await wasteRefund.json()).refundLogs[0].destination, "merma");
    assert.equal(
      await StockHistory.countDocuments({
        productId: "delete-merma",
        type: "merma",
      }),
      1,
    );
    assert.equal(await Product.exists({ id: "delete-merma" }), null);

    await Product.create({
      id: "delete-rollback",
      categoria: "ACCESORIO",
      marca: "VARIOS",
      modelo: "ROLLBACK",
      calidad: "ORIGINAL",
      precio: 2,
      stock: 1,
    });
    const originalCreateHistory = StockHistory.create;
    StockHistory.create = async () => {
      throw new Error("Fallo de auditoría simulado en base temporal");
    };
    try {
      assert.equal(
        (
          await productRoute.POST(
            apiRequest("/api/products", {
              action: "delete-permanent",
              id: "delete-rollback",
              confirmPermanent: true,
            }),
          )
        ).status,
        500,
      );
    } finally {
      StockHistory.create = originalCreateHistory;
    }
    assert.equal((await Product.findOne({ id: "delete-rollback" })).stock, 1);
    console.log(
      "PASS: devolución a merma de SKU eliminado y rollback del borrado si no puede registrarse su movimiento",
    );
    // Overnight audit regressions: this is still ONLY the randomly named disposable database.
    await Product.create({
      id: "audit-stock",
      marca: "SAMSUNG",
      modelo: "AUDIT A50",
      calidad: "ORIGINAL",
      precio: 2.1,
      stock: 20,
    });
    const createAudit = {
      action: "create",
      clientName: "Audit idempotency",
      items: [{ productId: "audit-stock", qty: 2, precioUSD: 2.1 }],
      currency: "USD",
      paid: true,
      exchangeRate: 835,
      requestId: "audit-sale-0001",
    };
    const firstAudit = await saleRoute.POST(
      apiRequest("/api/sales", createAudit),
    );
    assert.equal(firstAudit.status, 200);
    const auditSale = (await firstAudit.json()).sale;
    const repeatedAudit = await saleRoute.POST(
      apiRequest("/api/sales", {
        requestId: createAudit.requestId,
        ...createAudit,
      }),
    );
    assert.equal(repeatedAudit.status, 200);
    assert.equal((await repeatedAudit.json()).replayed, true);
    assert.equal((await Product.findOne({ id: "audit-stock" })).stock, 18);
    assert.equal(
      await Sale.countDocuments({ requestId: createAudit.requestId }),
      1,
    );
    assert.equal(
      (
        await saleRoute.POST(
          apiRequest("/api/sales", {
            ...createAudit,
            items: [{ productId: "audit-stock", qty: 3, precioUSD: 2.1 }],
          }),
        )
      ).status,
      409,
    );
    for (const invalid of [
      { ...createAudit, requestId: undefined, paid: "false" },
      {
        ...createAudit,
        requestId: undefined,
        items: [{ productId: { $ne: null }, qty: 1, precioUSD: 2.1 }],
      },
      {
        ...createAudit,
        requestId: undefined,
        items: [createAudit.items[0], createAudit.items[0]],
      },
      { ...createAudit, requestId: undefined, items: [null] },
    ])
      assert.equal(
        (await saleRoute.POST(apiRequest("/api/sales", invalid))).status,
        400,
      );
    const refundAudit = {
      action: "refund",
      saleId: auditSale._id,
      returns: [{ productId: "audit-stock", qty: 1, destination: "stock" }],
      reason: "Isolated audit",
      requestId: "audit-refund-0001",
    };
    assert.equal(
      (
        await saleRoute.POST(
          apiRequest("/api/sales", {
            ...refundAudit,
            requestId: undefined,
            returns: [
              { productId: "audit-stock", qty: 1, destination: "stcok" },
            ],
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (await saleRoute.POST(apiRequest("/api/sales", refundAudit))).status,
      200,
    );
    const repeatedRefund = await saleRoute.POST(
      apiRequest("/api/sales", refundAudit),
    );
    assert.equal(repeatedRefund.status, 200);
    assert.equal((await repeatedRefund.json()).replayed, true);
    assert.equal((await Product.findOne({ id: "audit-stock" })).stock, 19);
    assert.equal((await Sale.findById(auditSale._id)).refunds.length, 1);
    assert.equal(
      (
        await saleRoute.POST(
          apiRequest("/api/sales", {
            ...refundAudit,
            reason: "Changed request",
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await productRoute.POST(
          apiRequest("/api/products", { action: "delete", id: { $ne: null } }),
        )
      ).status,
      400,
    );
    const stockRoute = load("src/app/api/stock/route.ts");
    assert.equal(
      (
        await stockRoute.POST(
          apiRequest("/api/stock", {
            action: "add",
            productId: "audit-stock",
            qty: true,
          }),
        )
      ).status,
      400,
    );
    console.log(
      "PASS: reintentos de venta/devolución no duplican stock ni dinero; rechaza IDs operativos, booleans falsos y destinos inválidos",
    );
    const aiRepeated = await operations.proposeActions("audit-actor", [
      {
        type: "CREAR_ORDEN",
        payload: {
          clientName: "Audit duplicate consolidation",
          items: [
            { productQuery: "audit-stock", qty: 1, precioOverride: 0.1 },
            { productQuery: "audit-stock", qty: 2, precioOverride: 0.1 },
          ],
          currency: "USD",
          paid: true,
        },
      },
    ]);
    await operations.confirmActions(
      "audit-actor",
      aiRepeated.match(/CONFIRMAR ([A-F0-9]{8})/)[1],
    );
    const aiSale = await Sale.findOne({
      clientName: "Audit duplicate consolidation",
    });
    assert.equal(aiSale.items.length, 1);
    assert.equal(aiSale.items[0].qty, 3);
    assert.equal(aiSale.totalUSD, 0.3);
    console.log(
      "PASS: orden IA agrupa SKU repetido y redondea centavos sin líneas de devolución ambiguas",
    );

    const rankProducts = [
      "net",
      "returned",
      "cancelled",
      "zero",
      ...Array.from({ length: 18 }, (_, i) => "hidden-" + i),
    ];
    await Product.insertMany(
      rankProducts.map((id) => ({
        id: "audit-rank-" + id,
        marca: "QA",
        modelo: id.toUpperCase(),
        calidad: "ORIGINAL",
        precio: 1,
        stock: id === "zero" ? 0 : 1,
        isHidden: id.startsWith("hidden"),
      })),
    );
    const historyRow = (code, id, qty, returnedQty, status = "COMPLETED") => ({
      orderNumber: "AUDIT-" + code,
      clientName: "Audit ranking",
      items: [
        {
          productId: id,
          marca: "QA",
          modelo: code,
          calidad: "ORIGINAL",
          qty,
          returnedQty,
          precioUSD: 1,
          subtotalUSD: qty,
        },
      ],
      currency: "USD",
      paid: true,
      exchangeRate: 835,
      subtotalUSD: qty,
      totalUSD: qty,
      totalCUP: qty * 835,
      totalRefundedUSD: returnedQty,
      totalRefundedCUP: returnedQty * 835,
      status,
    });
    await Sale.insertMany(
      rankProducts.map((id) =>
        historyRow(
          id,
          "audit-rank-" + id,
          id === "net" ? 40 : 100,
          id === "returned" ? 99 : 0,
          id === "cancelled"
            ? "CANCELLED"
            : id === "returned"
              ? "PARTIALLY_REFUNDED"
              : "COMPLETED",
        ),
      ),
    );
    const ranking = await (
      await productRoute.GET(new Request("https://elarca.test/api/products"))
    ).json();
    assert.equal(
      ranking.products.find((p) => p.id === "audit-rank-net").salesCount,
      40,
    );
    assert.equal(
      ranking.products.find((p) => p.id === "audit-rank-returned").salesCount,
      1,
    );
    assert.equal(
      ranking.products.find((p) => p.id === "audit-rank-cancelled").isTopSeller,
      false,
    );
    assert.ok(!ranking.products.some((p) => /hidden|zero/.test(p.id)));
    console.log(
      "PASS: ranking público usa ventas netas, ignora anuladas y no pierde posiciones por ocultos/agotados",
    );

    const authGet = () =>
      new Request("https://elarca.test/api/sales", {
        headers: { cookie: "el_arca_admin_session=" + token },
      });
    const moneyPayload = {
      ...createAudit,
      clientName: "Audit rounded charge",
      requestId: "audit-money-0001",
      items: [{ productId: "audit-stock", qty: 3, precioUSD: 1 / 3 }],
    };
    const moneyResponse = await saleRoute.POST(
      apiRequest("/api/sales", moneyPayload),
    );
    assert.equal(moneyResponse.status, 200);
    const moneySale = (await moneyResponse.json()).sale;
    assert.equal(moneySale.totalUSD, 1);
    assert.equal(moneySale.totalCUP, 800);
    for (let i = 0; i < 3; i++) {
      const r = await saleRoute.POST(
        apiRequest("/api/sales", {
          action: "refund",
          saleId: moneySale._id,
          returns: [{ productId: "audit-stock", qty: 1 }],
          reason: "Rounding test only",
          requestId: "audit-money-refund-" + i,
        }),
      );
      assert.equal(r.status, 200);
    }
    const moneyReturned = await Sale.findById(moneySale._id);
    assert.equal(moneyReturned.totalRefundedUSD, moneyReturned.totalUSD);
    assert.equal(moneyReturned.totalRefundedCUP, moneyReturned.totalCUP);
    const concurrentPayload = {
      ...createAudit,
      requestId: "audit-concurrent-001",
      items: [{ productId: "audit-stock", qty: 1, precioUSD: 2.1 }],
    };
    const beforeConcurrent = (await Product.findOne({ id: "audit-stock" }))
      .stock;
    const concurrent = await Promise.all([
      saleRoute.POST(apiRequest("/api/sales", concurrentPayload)),
      saleRoute.POST(apiRequest("/api/sales", concurrentPayload)),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status),
      [200, 200],
    );
    assert.equal(
      (await Product.findOne({ id: "audit-stock" })).stock,
      beforeConcurrent - 1,
    );
    assert.equal(
      await Sale.countDocuments({ requestId: concurrentPayload.requestId }),
      1,
    );
    console.log(
      "PASS: total CUP guardado coincide con POS; devolución fraccionada recupera exactamente USD/CUP; doble POST concurrente vende una vez",
    );
    const baselineSummary = (await (await saleRoute.GET(authGet())).json())
      .daily;
    const summaryRows = Array.from({ length: 205 }, (_, i) =>
      historyRow("SUMMARY-" + i, "audit-summary", 1, 0),
    );
    summaryRows.push({
      ...historyRow("PENDING", "audit-summary", 10, 4, "PARTIALLY_REFUNDED"),
      paid: false,
    });
    await Sale.insertMany(summaryRows);
    const summary = await (await saleRoute.GET(authGet())).json();
    assert.equal(summary.sales.length, 200);
    assert.equal(summary.totalCount, await Sale.countDocuments({}));
    assert.equal(summary.historyLimited, true);
    assert.equal(summary.daily.count, baselineSummary.count + 206);
    assert.equal(
      summary.daily.todayGrossUSD,
      Number((baselineSummary.todayGrossUSD + 205).toFixed(2)),
    );
    assert.equal(
      summary.daily.todayRefundsUSD,
      baselineSummary.todayRefundsUSD,
    );
    assert.equal(
      summary.daily.todayPendingUSD,
      Number((baselineSummary.todayPendingUSD + 6).toFixed(2)),
    );
    console.log(
      "PASS: resumen diario incluye más de 200 órdenes; devolución pendiente reduce deuda sin fingir salida de caja",
    );

    const analytics = load("src/app/api/analytics/route.ts");
    assert.equal(
      (
        await analytics.POST(
          apiRequest("/api/analytics", {
            visitorId: "x".repeat(129),
            page: "/",
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await analytics.POST(
          new Request("https://elarca.test/api/analytics", {
            method: "POST",
            headers: {
              origin: "https://foreign.test",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ visitorId: "audit", page: "/" }),
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await analytics.POST(
          apiRequest("/api/analytics", {
            visitorId: "audit-visitor",
            page: "/",
            referrer: "",
          }),
        )
      ).status,
      200,
    );
    console.log(
      "PASS: analítica limita entradas y rechaza origen externo sin cerrar el catálogo",
    );
    // Four flat categories: compatibility, inventory identity, AI search and historical snapshots.
    const flatLegacy = {
      id: "flat-old-tapa",
      categoria: "TAPA",
      marca: "QA",
      modelo: "A32",
      calidad: "ORIGINAL",
      precio: 5,
      stock: 3,
      isHidden: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await Product.collection.insertOne(flatLegacy);
    const flatRows = await (
      await productRoute.GET(
        new Request("https://elarca.test/api/products?categoria=REPUESTO"),
      )
    ).json();
    const oldRow = flatRows.products.find((p) => p.id === "flat-old-tapa");
    assert.equal(oldRow.categoria, "REPUESTO");
    assert.equal(oldRow.modelo, "TAPA TRASERA A32");
    assert.equal(
      (await Product.collection.findOne({ id: "flat-old-tapa" })).categoria,
      "TAPA",
    );
    const flatDuplicate = await productRoute.POST(
      apiRequest("/api/products", {
        action: "add",
        product: {
          categoria: "REPUESTO",
          marca: "QA",
          modelo: "TAPA TRASERA A32",
          calidad: "ORIGINAL",
          precio: 5,
          stock: 1,
        },
      }),
    );
    assert.equal(flatDuplicate.status, 200);
    const flatDuplicateBody = await flatDuplicate.json();
    assert.equal(flatDuplicateBody.product.id, "flat-old-tapa");
    assert.equal(flatDuplicateBody.product.stock, 4);
    const flatFlex = await productRoute.POST(
      apiRequest("/api/products", {
        action: "add",
        product: {
          categoria: "REPUESTO",
          marca: "QA",
          modelo: "FLEX DE CARGA A32",
          calidad: "ORIGINAL",
          precio: 6,
          stock: 2,
        },
      }),
    );
    assert.equal(flatFlex.status, 200);
    const flatFlexBody = await flatFlex.json();
    assert.notEqual(flatFlexBody.product.id, "flat-old-tapa");
    const flatCharge = await productRoute.POST(
      apiRequest("/api/products", {
        action: "add",
        product: {
          categoria: "Regiones",
          marca: "QA",
          modelo: "A32",
          calidad: "ORIGINAL",
          precio: 7,
          stock: 2,
        },
      }),
    );
    assert.equal(flatCharge.status, 200);
    const flatChargeBody = await flatCharge.json();
    assert.equal(flatChargeBody.product.categoria, "REPUESTO");
    assert.equal(flatChargeBody.product.modelo, "CENTRO DE CARGA A32");
    const flatTool = await productRoute.POST(
      apiRequest("/api/products", {
        action: "add",
        product: {
          categoria: "Herramientas",
          marca: "QA",
          modelo: "PINZA DE PRECISION",
          calidad: "ORIGINAL",
          precio: 4,
          stock: 2,
        },
      }),
    );
    assert.equal(flatTool.status, 200);
    assert.equal((await flatTool.json()).product.categoria, "ACCESORIO");
    const smart = load("src/lib/whatsapp/tools.ts");
    assert.equal(
      (await smart.findProductSmart("región QA A32")).id,
      flatChargeBody.product.id,
    );
    assert.equal(
      (await smart.findProductSmart("flex de carga QA A32")).id,
      flatFlexBody.product.id,
    );
    assert.equal(
      (await smart.findProductSmart("tapa QA A32")).id,
      "flat-old-tapa",
    );
    const flatImport = await productRoute.POST(
      apiRequest("/api/products", {
        action: "sync",
        initialList: [
          {
            id: "flat-old-tapa",
            categoria: "TAPA",
            marca: "QA",
            modelo: "A32",
            calidad: "ORIGINAL",
            precio: 8,
            stock: 4,
          },
        ],
      }),
    );
    assert.equal(flatImport.status, 200);
    assert.equal(
      (await Product.findOne({ id: "flat-old-tapa" })).modelo,
      "TAPA TRASERA A32",
    );
    const oldSale = await Sale.create({
      ...historyRow("LEGACY-TAPA", "flat-old-tapa", 1, 0),
      items: [
        {
          productId: "flat-old-tapa",
          categoria: "TAPA",
          marca: "QA",
          modelo: "A32",
          calidad: "ORIGINAL",
          qty: 1,
          returnedQty: 0,
          precioUSD: 5,
          subtotalUSD: 5,
        },
      ],
      subtotalUSD: 5,
      totalUSD: 5,
      totalCUP: 4175,
    });
    const oldRefund = await saleRoute.POST(
      apiRequest("/api/sales", {
        action: "refund",
        saleId: String(oldSale._id),
        returns: [{ productId: "flat-old-tapa", qty: 1 }],
        reason: "Legacy category verification",
      }),
    );
    assert.equal(oldRefund.status, 200);
    assert.equal((await Sale.findById(oldSale._id)).items[0].categoria, "TAPA");
    assert.equal((await Product.findOne({ id: "flat-old-tapa" })).stock, 5);
    console.log(
      "PASS: cuatro categorías planas, tapas heredadas conservadas, Excel compatible y región/flex/tapa se distinguen por nombre sin subcategorías",
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
