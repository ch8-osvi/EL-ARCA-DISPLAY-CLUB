const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const ts = require("typescript");
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, "../..", file),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const original = m.require.bind(m);
  m.require = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : original(id));
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
const audio = load("src/lib/whatsapp/audio.ts");
test("notas de voz: valida formato, base64, duración y tamaño antes de llamar a IA", () => {
  assert.equal(audio.validateAudio(undefined), undefined);
  assert.equal(
    audio.validateAudio({
      data: "T0dH",
      mimeType: "audio/ogg; codecs=opus",
      seconds: 10,
    }).mimeType,
    "audio/ogg",
  );
  for (const value of [
    { data: "!!!!", mimeType: "audio/ogg" },
    { data: "T0dH", mimeType: "image/png" },
    { data: "T0dH", mimeType: "audio/ogg", seconds: 181 },
    { data: "T0dH", mimeType: "audio/ogg", seconds: "10" },
    {
      data: Buffer.alloc(audio.MAX_AUDIO_BYTES + 1).toString("base64"),
      mimeType: "audio/ogg",
    },
  ])
    assert.throws(() => audio.validateAudio(value));
});
test("WhatsApp: eventos de protocolo y reacciones no generan consultas ni respuestas", () => {
  const { extractText } = require("../../whatsapp-bridge/security");
  assert.equal(extractText({ message: { protocolMessage: {} } }), "");
  assert.equal(
    extractText({ message: { reactionMessage: { text: "👍" } } }),
    "",
  );
  assert.equal(
    extractText({
      message: { ephemeralMessage: { message: { conversation: "Hola" } } },
    }),
    "Hola",
  );
  assert.match(extractText({ message: { audioMessage: {} } }), /no textual/);
});
test("reenvío cifrado: mensaje recuperable tras reiniciar y borrado al caducar", async () => {
  const { messageStore } = require("../../whatsapp-bridge/message-store");
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), "arca-retry-"));
  try {
    await messageStore(folder).put("message-1", {
      conversation: "Respuesta original",
    });
    assert.deepEqual(await messageStore(folder).get({ id: "message-1" }), {
      conversation: "Respuesta original",
    });
    assert.equal(await messageStore(folder).get({ id: "missing" }), undefined);
    await messageStore(folder, -1).put("expired", { conversation: "Viejo" });
    assert.equal(await messageStore(folder).get({ id: "expired" }), undefined);
    await messageStore(folder).prune();
    assert.equal((await fsp.readdir(folder)).length, 1);
  } finally {
    await fsp.rm(folder, { recursive: true, force: true });
  }
});
test("QR: formulario no se recarga ni expone clave; datos se escapan y QR es privado", () => {
  const { scanPage } = require("../../whatsapp-bridge/scan-page");
  const html = scanPage({ error: "<script>alert(1)</script>" });
  assert.doesNotMatch(html, /http-equiv="refresh"|arca2026|<script>/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(
    scanPage({ authorized: true, connected: true, phone: "<img>" }),
    /&lt;img&gt;/,
  );
});

function serviceFixture({
  paused = false,
  blocked = false,
  transcript = "¿Tienes pantalla Samsung A12?",
  admin = false,
} = {}) {
  const calls = [],
    logs = [],
    proposals = [];
  const service = load("src/lib/whatsapp/service.ts", {
    "@/lib/mongoose": { __esModule: true, default: async () => {} },
    "@/lib/models/Product": {
      Product: {
        aggregate: async () => [
          {
            id: "a12",
            marca: "SAMSUNG",
            modelo: "A12",
            calidad: "INCELL",
            precio: 15,
            stock: 3,
          },
        ],
        findOne: () => ({ lean: async () => null }),
      },
    },
    "@/lib/models/Sale": { Sale: {} },
    "@/lib/models/WhatsAppLog": {
      WhatsAppLog: {
        create: async (entry) => logs.push(entry),
        aggregate: async () => [],
      },
    },
    "@/lib/models/WhatsAppConfig": {
      getWhatsAppConfig: async () => ({
        adminPhones: admin ? ["5350000001"] : [],
        blacklistedPhones: blocked ? ["5350000001"] : [],
      }),
    },
    "@/lib/models/BotState": {
      BotConversation: {
        findById: () => ({ lean: async () => ({ paused, turns: [] }) }),
        updateOne: async () => {},
      },
      BotPending: {},
    },
    "@/lib/exchangeRate": {
      getActiveExchangeRate: async () => ({ rate: 835 }),
    },
    "@/lib/dateUtils": { getHavanaDateKey: () => "2026-10-24" },
    "@/lib/searchUtils": { roundCupPrice: (price, rate) => price * rate },
    "@/lib/security/limits": { allowRequest: async () => true },
    "@/lib/ai/operations": {
      proposeActions: async (...args) => {
        proposals.push(args);
        return "Propuesta";
      },
      confirmActions: async () => {
        throw Error("No confirmar audio");
      },
    },
    "@/lib/ai/gemini": {
      queryGemini: async (system, contents, tools) => {
        calls.push({ system, contents, tools });
        return calls.length === 1
          ? { text: transcript, tokens: 10, actions: [] }
          : {
              text: "Disponible a $15 USD.",
              tokens: 20,
              actions: [],
              model: "test",
            };
      },
    },
    "@/lib/ai/batchParser": {},
    "@/lib/duplicateDetector": {},
    "./identity": {
      normalizePhoneNumber: (s) => s,
      validPhone: () => true,
      resolveCanonicalPhone: (s) => s,
    },
    "./outbox": {},
    "./audio": audio,
  });
  return { service, calls, logs, proposals };
}
const voice = { data: "T0dH", mimeType: "audio/ogg", seconds: 1 };
test("audio → Gemini → catálogo: consulta usa transcripción, registra tokens y no guarda audio en historial", async () => {
  const f = serviceFixture();
  const reply = await f.service.processWhatsAppAiMessage(
    "[Nota de voz]",
    "5350000001",
    { audio: voice },
  );
  assert.match(reply, /15 USD/);
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.calls[0].contents[0].parts[0].inlineData.mimeType,
    "audio/ogg",
  );
  assert.match(f.calls[1].contents.at(-1).parts[0].text, /Samsung A12/);
  assert.equal(f.calls[1].tools, false);
  assert.equal(f.logs[0].tokens, 30);
  assert.match(f.logs[0].userMessage, /Samsung A12/);
  assert.doesNotMatch(JSON.stringify(f.logs), /T0dH/);
});
test("audio de cliente bloqueado o pausado no llama Gemini", async () => {
  for (const options of [{ blocked: true }, { paused: true }, { paused: true, admin: true }]) {
    const f = serviceFixture(options);
    assert.equal(
      await f.service.processWhatsAppAiMessage("[Nota de voz]", "5350000001", {
        audio: voice,
      }),
      "",
    );
    assert.equal(f.calls.length, 0);
  }
});
test("confirmar por audio exige código escrito; audio ininteligible pide aclaración", async () => {
  const f = serviceFixture({ admin: true, transcript: "CONFIRMAR ABCD1234" });
  assert.match(
    await f.service.processWhatsAppAiMessage("[Nota de voz]", "5350000001", {
      audio: voice,
    }),
    /por escrito/,
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.proposals.length, 0);
  const unclear = serviceFixture({ transcript: "AUDIO_INCOMPRENSIBLE" });
  assert.match(
    await unclear.service.processWhatsAppAiMessage(
      "[Nota de voz]",
      "5350000001",
      { audio: voice },
    ),
    /No pude entender/,
  );
  assert.equal(unclear.calls.length, 1);
});
