const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
function load(file) {
  const name = path.resolve(__dirname, "../..", file),
    mod = new Module(name, module);
  mod.filename = name;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (id) =>
    id.startsWith(".")
      ? load(
          path.relative(
            path.resolve(__dirname, "../.."),
            path.resolve(path.dirname(name), id + ".ts"),
          ),
        )
      : original(id);
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
const {
  fuzzyMatchProduct: search,
  fuzzyMatchGeneric,
  levenshteinDistance,
} = load("src/lib/searchUtils.ts");
const item = (modelo, extra = {}) => ({
  id: "sku-test-1028",
  marca: "SAMSUNG",
  modelo,
  calidad: "ORIGINAL C/M",
  categoria: "DISPLAY",
  precio: 11,
  ...extra,
});
test("buscador: Note 8 Pro no desaparece al escribir la primera letra de Pro", () => {
  const product = item("REDMI NOTE 8 PRO", { marca: "XIAOMI" });
  for (const query of [
    "note 8",
    "note 8 p",
    "note 8 pr",
    "note 8 pro",
    "rm note 8 p",
    "rn8 p",
    "  NOTE   8   P  ",
  ])
    assert.equal(search(product, query).match, true, query);
  for (const query of [
    "note 9 p",
    "note 8 max",
    "note 8 plus",
    "note 8p",
    "note 8 t",
  ])
    assert.equal(search(product, query).match, false, query);
});
test("buscador: variantes parciales respetan modelo, sufijos e identidad", () => {
  for (const [model, query] of [
    ["11 PRO MAX", "iphone 11 p"],
    ["11 PRO MAX", "iphone 11 pro m"],
    ["11 PLUS", "iphone 11 p"],
    ["11 LITE", "iphone 11 l"],
  ])
    assert.equal(
      search(item(model, { marca: "IPHONE" }), query).match,
      true,
      query,
    );
  for (const [model, query] of [
    ["A03S", "a 03 s"],
    ["8T", "8 t"],
    ["8P", "8 p"],
  ])
    assert.equal(search(item(model), query).match, true, query);
  for (const [model, query] of [
    ["REDMI NOTE 8", "note 8 p"],
    ["REDMI NOTE 9 PRO", "note 8 p"],
    ["A03", "a 03 s"],
    ["11", "iphone 11 p"],
  ])
    assert.equal(
      search(
        item(model, { marca: "IPHONE", calidad: "PROFESIONAL PLUS PREMIUM" }),
        query,
      ).match,
      false,
      `${model}: ${query}`,
    );
});
test("buscador: tolera marcas mal escritas, abreviaturas y consultas pegadas", () => {
  for (const query of [
    "sansun a03",
    "sam a03",
    "samsnug a03",
    "sansuna03",
    "samsunga03",
    "A 03",
    "sm03",
  ])
    assert.equal(search(item("A03"), query).match, true, query);
  const redmi = item("REDMI NOTE 11", { marca: "XIAOMI" });
  for (const query of ["rn11", "redminote11", "xiaomiredminote11"])
    assert.equal(search(redmi, query).match, true, query);
  for (const query of ["ipon 11", "ipon11", "ip11"])
    assert.equal(
      search(item("11", { marca: "IPHONE" }), query).match,
      true,
      query,
    );
  assert.equal(
    search(item("G 22", { marca: "MOTOROLA" }), "motog22").match,
    true,
  );
});
test("buscador: protege números y sufijos; una familia puede encontrarse con su prefijo", () => {
  for (const [model, query] of [
    ["A02", "a03"],
    ["A035", "a03"],
    ["A04E", "a04s"],
    ["A03", "a03s"],
    ["A21", "a12"],
    ["11", "12"],
  ])
    assert.equal(
      search(item(model), query).match,
      false,
      `${query} no debe coincidir con ${model}`,
    );
  assert.equal(search(item("A03S"), "a03").match, true);
  assert.equal(search(item("A03S"), "a0").match, true);
  assert.equal(search(item("A02S / A03S / A04E / F04"), "a03s").match, true);
  assert.equal(search(item("A03S"), "A 03 S").match, true);
});
test("buscador: no sustituye variantes ni usa calidad como variante del teléfono", () => {
  assert.equal(search(item("A32 4G"), "a32 5g").match, false);
  assert.equal(
    search(
      item("11", { marca: "IPHONE", calidad: "PROFESIONAL" }),
      "iphone 11 pro",
    ).match,
    false,
  );
  assert.equal(
    search(item("11 PRO MAX", { marca: "IPHONE" }), "iphone11 pro max").match,
    true,
  );
  assert.equal(
    search(item("REDMI 11", { marca: "XIAOMI" }), "redmi note 11").match,
    false,
  );
});
test("buscador: marco y tecnología se distinguen; acepta faltas en palabras", () => {
  assert.equal(search(item("A50"), "a50 c/m").match, true);
  assert.equal(search(item("A50"), "a50 sin marco").match, false);
  assert.equal(
    search(item("A50", { calidad: "ORIGINAL S/M" }), "a50 s/m").match,
    true,
  );
  assert.equal(
    search(item("A50", { calidad: "AMOLED" }), "a50 oled").match,
    false,
  );
  assert.equal(search(item("A50"), "a50 origianl").match, true);
});
test("buscador: no encuentra un modelo por precio o fragmentos de ID; sí por ID completo", () => {
  const p = item("A20", { id: "sale-11-2026", precio: 11 });
  assert.equal(search(p, "11").match, false);
  assert.equal(search(p, "2026").match, false);
  assert.equal(search(p, "sale-11-2026").match, true);
});
test("buscador: coincidencia exacta primero, caché invalidada al editar el producto", () => {
  const p = item("A03");
  assert.ok(search(p, "a03").score > search(item("A03S"), "a03").score);
  assert.ok(
    search(p, "a03").score > search(item("A02S / A03 / A04E"), "a03").score,
  );
  assert.equal(search(p, "a03").match, true);
  p.modelo = "A02";
  assert.equal(search(p, "a03").match, false);
});
test("buscador: categorías planas, nombres de piezas y acentos", () => {
  assert.equal(
    search(item("CENTRO DE CARGA A50", { categoria: "REPUESTO" }), "region a50")
      .match,
    true,
  );
  assert.equal(
    search(item("A50", { categoria: "TAPA" }), "tapa a50").match,
    true,
  );
  assert.equal(
    search(
      item("PINZA DE PRECISIÓN", { categoria: "ACCESORIO", marca: "VARIOS" }),
      "pinza precision",
    ).match,
    true,
  );
  assert.equal(
    search(
      item("FLEX DE CARGA A50", { categoria: "REPUESTO" }),
      "centro de carga a50",
    ).match,
    false,
  );
});
test("buscador: entradas largas no bloquean; vacío conserva todo; genérico conserva cero", () => {
  assert.deepEqual(search(item("A50"), " "), { match: true, score: 0 });
  assert.equal(search(item("A50"), "x".repeat(10000)).match, false);
  assert.equal(search(item("A50"), "///").match, false);
  assert.equal(fuzzyMatchGeneric([0], "0"), true);
  assert.equal(levenshteinDistance("kitten", "sitting"), 3);
});
