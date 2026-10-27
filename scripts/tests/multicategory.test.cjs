const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
function load(file) {
  const filename = path.resolve(__dirname, "../..", file),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const original = m.require.bind(m);
  m.require = (id) =>
    id.startsWith(".")
      ? load(
          path.relative(
            path.resolve(__dirname, "../.."),
            path.resolve(path.dirname(filename), id + ".ts"),
          ),
        )
      : original(id);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const categories = load("src/lib/categories.ts"),
  customer = load("src/lib/whatsapp/customer.ts");
test("Excel: conserva signos y decimales para validar sin truncar cantidades", () => {
  const { parseCatalogNumber } = load("src/lib/catalogNumbers.ts");
  assert.equal(parseCatalogNumber("-2"), -2);
  assert.equal(parseCatalogNumber("1,5"), 1.5);
  assert.equal(parseCatalogNumber("$12,50 USD"), 12.5);
  assert.equal(parseCatalogNumber("1,234.50"), 1234.5);
  assert.ok(Number.isNaN(parseCatalogNumber("sin precio")));
});
test("categorías: compatibilidad heredada, alias en español y rechazo de valores inválidos", () => {
  for (const value of [undefined, null, "", "Pantallas"])
    assert.equal(categories.productCategory(value), "DISPLAY");
  assert.equal(categories.productCategory("Baterías"), "BATERIA");
  assert.equal(categories.productCategory("Tapas traseras"), "TAPA");
  assert.equal(categories.productCategory("Accesorios"), "ACCESORIO");
  assert.throws(() => categories.productCategory("OTRO"));
  assert.ok(
    categories
      .categoryFilter("DISPLAY")
      .$or.some((x) => x.categoria?.$exists === false),
  );
  assert.deepEqual(categories.categoryFilter("BATERIA"), {
    categoria: "BATERIA",
  });
});
test("inventario: cero válido; rechaza fracciones, negativos y números no finitos", () => {
  categories.assertProductNumbers(0, 0);
  for (const stock of [-1, 0.5, Infinity, NaN, "2", 10001])
    assert.throws(() => categories.assertProductNumbers(10, stock));
  for (const price of [-1, Infinity, NaN, "12"])
    assert.throws(() => categories.assertProductNumbers(price, 2));
});
test("cliente: usa el último modelo del usuario y conserva la aclaración de categoría", () => {
  const history = [
    { sender: "user", text: "Samsung A12" },
    { sender: "model", text: "También Redmi 9A" },
  ];
  assert.equal(
    customer.customerSearchText("¿Y con marco?", history),
    "Samsung A12 ¿Y con marco?",
  );
  assert.equal(customer.customerSearchText("Redmi 10A", history), "Redmi 10A");
  assert.equal(
    customer.customerSearchText("Batería", history),
    "Samsung A12 Batería",
  );
  assert.equal(
    customer.detectCategoryIntent(
      customer.customerSearchText("A50", [
        { sender: "user", text: "Busco baterías" },
      ]),
    ),
    "BATERIA",
  );
  assert.equal(
    customer.detectCategoryIntent("pantalla y batería A50"),
    undefined,
  );
});
test("comprobantes HTML: escapa campos de texto y conserva importes y fechas", () => {
  const { escapePrintData } = load("src/lib/printSafety.ts");
  const createdAt = new Date();
  const result = escapePrintData({
    clientName: '<img src=x onerror="alert(1)">',
    items: [{ modelo: "A&B", qty: 2 }],
    createdAt,
  });
  assert.equal(
    result.clientName,
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
  assert.equal(result.items[0].modelo, "A&amp;B");
  assert.equal(result.items[0].qty, 2);
  assert.equal(result.createdAt, createdAt);
});

test("duplicados: una batería y una pantalla del mismo modelo nunca se fusionan", () => {
  const { calculateDuplicateScore } = load("src/lib/duplicateDetector.ts");
  const item = {
    id: "a",
    marca: "SAMSUNG",
    modelo: "A50",
    calidad: "ORIGINAL",
    stock: 1,
    precio: 5,
  };
  assert.equal(
    calculateDuplicateScore(
      { ...item, categoria: "DISPLAY" },
      { ...item, id: "b", categoria: "BATERIA" },
    ).score,
    0,
  );
});

test("Excel exportado: conserva ID, categoría y stock cero en un archivo real", async () => {
  const filename = path.resolve(__dirname, "../../src/app/admin/page.tsx");
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let initializer;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "handleExportExcel"
    )
      initializer = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(initializer);
  const code = ts.transpileModule("const handleExportExcel = " + initializer, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  let workbook;
  const style = require("xlsx-js-style");
  const products = [
    {
      id: "stable-display",
      categoria: "DISPLAY",
      marca: "SAMSUNG",
      modelo: "A50",
      calidad: "ORIGINAL",
      precio: 20,
      stock: 3,
    },
    {
      id: "stable-battery",
      categoria: "BATERIA",
      marca: "SAMSUNG",
      modelo: "A50",
      calidad: "ORIGINAL",
      precio: 8,
      stock: 0,
    },
  ];
  const messages = [];
  const run = new Function(
    "require",
    "products",
    "getCanonicalBrand",
    "productCategory",
    "triggerToast",
    code + ";return handleExportExcel;",
  )(
    (id) => {
      assert.equal(id, "xlsx-js-style");
      return {
        ...style,
        writeFile: (value) => {
          workbook = value;
        },
      };
    },
    products,
    (value) => value,
    categories.productCategory,
    (value) => messages.push(value),
  );
  await run();
  assert.ok(workbook, messages.join(" "));
  const reader = require("xlsx");
  const result = reader.read(
    style.write(workbook, { type: "buffer", bookType: "xlsx" }),
    { type: "buffer" },
  );
  const rows = reader.utils.sheet_to_json(result.Sheets.CATALOGO, {
    header: 1,
  });
  assert.equal(rows[0][7], "CATEGORIA");
  assert.equal(rows[0][8], "ID");
  assert.equal(rows.find((row) => row[8] === "stable-battery")[7], "BATERIA");
  assert.equal(rows.find((row) => row[8] === "stable-battery")[6], 0);
  assert.equal(rows.find((row) => row[8] === "stable-display")[7], "DISPLAY");
});
