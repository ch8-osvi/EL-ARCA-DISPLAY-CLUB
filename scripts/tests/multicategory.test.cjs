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

test("calidad: original sin marco se muestra ORIGINAL y con marco sigue separado", () => {
  for (const input of [
    "ORIGINAL",
    "Original S/M",
    "original SM",
    "ORIGINAL S M",
    " Original sin marco ",
    "ORIGINAL SINMARCO",
  ])
    assert.equal(categories.productQuality(input), "ORIGINAL", input);
  for (const input of [
    "ORIGINAL C/M",
    "ORIGINAL CON MARCO",
    "ORIGINAL SERVICE PACK",
    "OLED SOFT",
  ])
    assert.equal(categories.productQuality(input), input, input);
  const qualities = categories.CATEGORIES.find(
    (c) => c.id === "DISPLAY",
  ).qualities;
  assert.ok(qualities.includes("ORIGINAL"));
  assert.ok(qualities.includes("ORIGINAL C/M"));
  assert.ok(!qualities.includes("ORIGINAL S/M"));
  assert.deepEqual(qualities, [
    "ORIGINAL C/M",
    "ORIGINAL",
    "INCELL C/M",
    "INCELL",
    "OLED",
    "AMOLED",
  ]);
  const identity = categories.productIdentityFilter({
    marca: "XIAOMI",
    modelo: "REDMI 6 / 6A",
    calidad: "ORIGINAL",
  });
  assert.ok(identity.calidad.test("ORIGINAL S/M"));
  assert.ok(identity.calidad.test("ORIGINAL SIN MARCO"));
  assert.ok(!identity.calidad.test("ORIGINAL C/M"));
});

test("calidad: Incell omite sin marco, reconoce in-cell y conserva las especificaciones", () => {
  for (const input of [
    "INCELL",
    "INCELL S/M",
    "in-cell sin marco",
    "IN CELL SM",
    "INCELL SINMARCO",
  ])
    assert.equal(categories.productQuality(input), "INCELL", input);
  assert.equal(
    categories.productQuality("INCELL S/M HD 120HZ"),
    "INCELL HD 120HZ",
  );
  assert.equal(
    categories.productQuality("ORIGINAL SIN MARCO SERVICE PACK"),
    "ORIGINAL SERVICE PACK",
  );
  assert.equal(categories.productQuality("INCELL C/M"), "INCELL C/M");
  const identity = categories.productIdentityFilter({
    marca: "SAMSUNG",
    modelo: "A15 PRO",
    calidad: "INCELL",
  });
  assert.ok(identity.calidad.test("INCELL S/M"));
  assert.ok(identity.calidad.test("IN-CELL SIN MARCO"));
  assert.ok(!identity.calidad.test("INCELL C/M"));
  const { cleanModelAndQuality } = load("src/lib/ai/batchParser.ts");
  for (const input of ["INCELL", "INCELL S/M", "IN-CELL SIN MARCO"])
    assert.deepEqual(cleanModelAndQuality("NOTE 10 PRO", input), {
      modelo: "NOTE 10 PRO",
      calidad: "INCELL",
    });
  for (const quality of [
    "INCELL C/M",
    "OLED",
    "AMOLED",
    "OLED SOFT 120HZ",
    "ORIGINAL SERVICE PACK",
    "INCELL HD 120HZ",
  ])
    assert.equal(cleanModelAndQuality("NOTE 10 PRO", quality).calidad, quality);
});

test("IA: guarda ORIGINAL, sin añadir marco ni S/M, y conserva ORIGINAL C/M", () => {
  const { cleanModelAndQuality, parseBatchProductsFromText } = load(
    "src/lib/ai/batchParser.ts",
  );
  for (const quality of [
    "ORIGINAL",
    "ORIGINAL S/M",
    "ORIGINAL SIN MARCO",
    "ORIGINAL SM",
  ])
    assert.deepEqual(cleanModelAndQuality("REDMI 6 / 6A", quality), {
      modelo: "REDMI 6 / 6A",
      calidad: "ORIGINAL",
    });
  assert.deepEqual(cleanModelAndQuality("REDMI 6 / 6A", "ORIGINAL C/M"), {
    modelo: "REDMI 6 / 6A",
    calidad: "ORIGINAL C/M",
  });
  const rows = parseBatchProductsFromText(
    "XIAOMI REDMI 6/6A (ORIGINAL) S/M x1 - $13\nXIAOMI REDMI 8/8A (ORIGINAL) x7 - $12",
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.calidad === "ORIGINAL"));
  assert.equal(rows[0].stock, 1);
  assert.equal(rows[1].stock, 7);
});

test("catálogo plano: cuatro categorías, sin tipos ni subcategorías visibles", () => {
  assert.deepEqual(categories.CATEGORY_IDS, [
    "DISPLAY",
    "BATERIA",
    "REPUESTO",
    "ACCESORIO",
  ]);
  assert.deepEqual(
    categories.CATEGORIES.map((c) => c.label),
    ["Pantallas", "Baterías", "Repuestos", "Accesorios y herramientas"],
  );
  for (const alias of [
    "TAPA",
    "Tapas traseras",
    "Regiones",
    "Flex",
    "Tablillas de carga",
    "Centros de carga",
  ])
    assert.equal(categories.productCategory(alias), "REPUESTO");
  for (const alias of [
    "Herramientas",
    "Accesorios",
    "Accesorios y herramientas",
  ])
    assert.equal(categories.productCategory(alias), "ACCESORIO");
  assert.equal(categories.categoryLabel("TAPA"), "Repuestos");
  assert.ok(categories.STORED_CATEGORY_IDS.includes("TAPA"));
  assert.ok(!categories.CATEGORY_IDS.includes("TAPA"));
});

test("tapas antiguas: se conserva la identidad de la pieza sin otra categoría", () => {
  const original = {
    id: "old",
    categoria: "TAPA",
    modelo: "A50",
    precio: 5,
    stock: 2,
  };
  const normalized = categories.catalogProduct(original);
  assert.equal(normalized.categoria, "REPUESTO");
  assert.equal(normalized.modelo, "TAPA TRASERA A50");
  assert.equal(original.modelo, "A50");
  assert.equal(normalized.id, original.id);
  assert.equal(normalized.stock, original.stock);
  assert.equal(
    categories.productDisplayModel("TAPA TRASERA A50", "TAPA"),
    "TAPA TRASERA A50",
  );
  assert.equal(
    categories.productDisplayModel("A50", "Regiones"),
    "CENTRO DE CARGA A50",
  );
  assert.equal(categories.productDisplayModel("A50", "Flex"), "FLEX A50");
});

test("cliente: región, módulo de carga y flex son repuestos; herramientas comparten accesorios", () => {
  for (const text of [
    "región A50",
    "módulo de carga A50",
    "tablilla de carga A50",
    "flex A50",
    "flex de batería A50",
    "flex de pantalla A50",
    "tapa y flex A50",
  ])
    assert.equal(customer.detectCategoryIntent(text), "REPUESTO", text);
  for (const text of [
    "destornillador",
    "pinza de precisión",
    "accesorios y herramientas",
    "protector de pantalla",
  ])
    assert.equal(customer.detectCategoryIntent(text), "ACCESORIO", text);
  assert.match(
    customer.customerSearchText("A50", [
      { sender: "user", text: "Busco un flex" },
    ]),
    /flex/i,
  );
  assert.equal(customer.detectCategoryIntent("pantalla y flex A50"), undefined);
});
test("devoluciones: un producto retirado nunca se etiqueta como repuesto a stock", () => {
  const { refundDestinationLabel } = load("src/lib/refundDestinations.ts");
  assert.equal(refundDestinationLabel("retirado"), "Fuera de inventario");
  assert.equal(refundDestinationLabel("merma"), "Merma / baja");
  assert.equal(refundDestinationLabel(), "A stock");
});
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
  assert.equal(categories.productCategory("Tapas traseras"), "REPUESTO");
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

test("repuestos y accesorios: compartir categoría no convierte piezas diferentes en duplicados", () => {
  const { calculateDuplicateScore } = load("src/lib/duplicateDetector.ts");
  const common = {
    id: "x",
    categoria: "REPUESTO",
    marca: "SAMSUNG",
    calidad: "ORIGINAL",
    stock: 2,
    precio: 5,
  };
  const tapa = { ...common, modelo: "TAPA TRASERA A32 / A50 / A70" };
  const flex = { ...common, id: "y", modelo: "FLEX DE CARGA A32 / A50 / A70" };
  assert.equal(calculateDuplicateScore(tapa, flex).score, 0);
  assert.equal(
    calculateDuplicateScore(
      { ...common, categoria: "TAPA", modelo: "A50" },
      { ...common, modelo: "TAPA TRASERA A50" },
    ).score,
    100,
  );
});

test("IA: solo propone cuatro categorías y mantiene compatibilidad con altas antiguas de tapas", () => {
  const { validateActions, functionDeclarations } = load(
    "src/lib/ai/contracts.ts",
  );
  const [action] = validateActions([
    {
      type: "AGREGAR_PRODUCTO",
      payload: {
        categoria: "TAPA",
        marca: "SAMSUNG",
        modelo: "A50",
        calidad: "ORIGINAL",
        precio: 5,
        stock: 1,
      },
    },
  ]);
  assert.equal(action.payload.categoria, "REPUESTO");
  assert.equal(action.payload.modelo, "TAPA TRASERA A50");
  const declaration = functionDeclarations.find(
    (f) => f.name === "AGREGAR_PRODUCTO",
  );
  assert.deepEqual(
    declaration.parametersJsonSchema.properties.categoria.enum,
    categories.CATEGORY_IDS,
  );
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
