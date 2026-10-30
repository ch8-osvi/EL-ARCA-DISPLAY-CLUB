const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { loadSource } = require("./helpers/load-source.cjs");

// Exercise the real page handlers with controlled hooks and delayed HTTP responses.
// All API data here is synthetic; this test never connects to the business database.
test("inventario: guardado fluido confirmado, errores conservados y atajos protegidos", async () => {
  const previousGlobals = Object.fromEntries(
    ["fetch", "window", "document", "requestAnimationFrame", "setTimeout"].map(
      (k) => [k, global[k]],
    ),
  );
  const states = [],
    effects = [],
    refs = [],
    listeners = new Map(),
    calls = [];
  let stateIndex = 0,
    effectIndex = 0,
    refIndex = 0,
    pendingEffects = [],
    tree;
  const original = {
    id: "qa-note8",
    marca: "XIAOMI",
    modelo: require("../../src/data/products_seed.json").find(
      (p) => p.modelo.length > 200,
    ).modelo,
    calidad: "ORIGINAL",
    categoria: "DISPLAY",
    precio: 12,
    stock: 3,
    updatedAt: "2026-10-30T00:00:00.000Z",
  };
  let resolveWrite;
  const catalog = [
    original,
    ...Array.from({ length: 80 }, (_, i) => ({
      ...original,
      id: `qa-extra-${i + 1}`,
      modelo: `ZZQA${String(i + 1).padStart(4, "0")}`,
      stock: 0,
    })),
  ];
  const response = (data) => ({ ok: true, json: async () => data });
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options?.method === "POST")
      return new Promise((resolve) => {
        resolveWrite = resolve;
      });
    if (url === "/api/stock")
      return response({ success: true, products: catalog });
    if (url.includes("merma")) return response({ mermas: [] });
    return response({ rate: 865 });
  };
  global.window = {
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: (key) => listeners.delete(key),
  };
  global.document = { activeElement: null };
  global.requestAnimationFrame = (fn) => fn();
  global.setTimeout = () => 0;
  const hooks = {
    ...React,
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (v) => {
          states[i] = typeof v === "function" ? v(states[i]) : v;
        },
      ];
    },
    useRef(initial) {
      const i = refIndex++;
      return (refs[i] ||= { current: initial });
    },
    useMemo(fn) {
      return fn();
    },
    useEffect(fn, deps) {
      const i = effectIndex++;
      const old = effects[i];
      if (!old || deps.some((v, j) => v !== old.deps[j])) {
        pendingEffects.push(() => {
          old?.cleanup?.();
          effects[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const stub = () => null;
  const { default: Page } = loadSource(
    "src/app/admin/pos/inventario/page.tsx",
    {
      react: hooks,
      "react/jsx-runtime": {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
      },
      "lucide-react": new Proxy({}, { get: () => stub }),
      "./loading": { default: stub },
      "@/lib/auth-client": { checkAdminSession: async () => true },
      "@/lib/useActiveExchangeRate": {
        useActiveExchangeRate: () => [865, () => {}],
      },
      "next/link": { default: stub },
      ...Object.fromEntries(
        [
          "BrandFilter",
          "ProductPrice",
          "ProductIdentity",
          "CategoryFilter",
        ].map((name) => ["@/components/" + name, { default: stub }]),
      ),
    },
  );
  const nodes = (node = tree) =>
    !node || typeof node !== "object"
      ? []
      : Array.isArray(node)
        ? node.flatMap((n) => nodes(n))
        : [node, ...nodes(node.props?.children ?? null)];
  const find = (predicate) => nodes().find((n) => predicate(n.props || {}, n));
  const card = () => find((p) => p["data-inventory-product"]);
  function render() {
    stateIndex = effectIndex = refIndex = 0;
    tree = Page();
    const elements = nodes().filter((n) => typeof n.type === "string");
    const cards = elements.filter((n) => n.props["data-inventory-product"]);
    for (const n of elements) {
      n.dom ||= {
        isConnected: true,
        focus() {
          document.activeElement = n.dom;
        },
        select() {
          this.selected = true;
        },
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return cards.map((c) => c.dom);
        },
        requestSubmit() {
          n.props.onSubmit({ preventDefault() {} });
        },
      };
      if (n.props.ref) n.props.ref.current = n.dom;
    }
    const run = pendingEffects;
    pendingEffects = [];
    run.forEach((fn) => fn());
  }
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      render();
    }
  };
  const key = (key, extra = {}) => {
    let prevented = false;
    listeners.get("keydown")?.({
      key,
      preventDefault() {
        prevented = true;
      },
      ...extra,
    });
    return prevented;
  };
  try {
    render();
    await settle();
    assert.equal(card().props["data-inventory-product"], original.id);
    const cardCount = () =>
      nodes().filter((n) => n.props?.["data-inventory-product"]).length;
    assert.equal(
      cardCount(),
      40,
      "large catalog initially mounts only 40 cards",
    );
    const getCount = calls.filter((c) => !c.options).length;
    let search = find((p) => p["aria-label"] === "Buscar en inventario");
    key("F2", { ctrlKey: true });
    assert.equal(document.activeElement, search.dom);
    assert.equal(search.dom.selected, true);
    key("ArrowDown");
    assert.equal(document.activeElement, card().dom);
    const selectedCard = card();
    selectedCard.props.onKeyDown({
      key: "Enter",
      target: selectedCard.dom,
      currentTarget: selectedCard.dom,
      preventDefault() {},
    });
    render();
    assert.ok(find((p) => p.ref && p.onSubmit && p.ref.current));
    const price = find((p) => p.type === "number" && p.value === "12");
    price.props.onChange({ target: { value: "15" } });
    render();
    key("Enter", { ctrlKey: true });
    render();
    const pricePayload = JSON.parse(calls.at(-1).options.body);
    assert.ok(original.modelo.length > 200);
    assert.equal(pricePayload.precio, 15);
    for (const field of ["modelo", "marca", "calidad", "categoria", "stock"])
      assert.equal(
        Object.hasOwn(pricePayload, field),
        false,
        `price edit must omit unchanged ${field}`,
      );
    assert.ok(card(), "cards stay mounted while saving");
    assert.equal(key("Escape"), true);
    render();
    assert.ok(
      find((p) => p.type === "number" && p.value === "15"),
      "Esc cannot discard an in-flight save",
    );
    resolveWrite(
      response({
        success: true,
        product: {
          ...original,
          precio: 15,
          updatedAt: "2026-10-30T01:00:00.000Z",
        },
      }),
    );
    await settle();
    assert.ok(card());
    assert.equal(
      calls.filter((c) => !c.options).length,
      getCount,
      "no inventory/rate/history GET after saving",
    );
    find((p) => p.title === "Editar producto").props.onClick();
    render();
    assert.ok(
      find((p) => p.type === "number" && p.value === "15"),
      "next edit uses confirmed price",
    );
    const stock = find((p) => p.type === "number" && p.value === "3");
    stock.props.onChange({ target: { value: "9" } });
    render();
    key("Enter", { ctrlKey: true });
    render();
    const payload = JSON.parse(calls.at(-1).options.body);
    assert.equal(payload.stock, 9);
    assert.equal(Object.hasOwn(payload, "modelo"), false);
    assert.equal(Object.hasOwn(payload, "precio"), false);
    assert.equal(payload.expectedUpdatedAt, "2026-10-30T01:00:00.000Z");
    resolveWrite({
      ok: false,
      json: async () => ({ success: false, error: "Conflicto de stock" }),
    });
    await settle();
    assert.ok(
      find((p) => p.type === "number" && p.value === "9"),
      "failed save keeps entered stock",
    );
    assert.ok(nodes().some((n) => n.props?.children === "Conflicto de stock"));
    assert.ok(card(), "failed save keeps original cards");
    key("Escape");
    render();
    find((p) => p.title === "Editar producto").props.onClick();
    render();
    assert.ok(
      find((p) => p.type === "number" && p.value === "3"),
      "rejected stock never reaches card",
    );
    key("Escape");
    render();
    find((p) => Object.hasOwn(p, "data-inventory-more")).props.onClick();
    render();
    assert.equal(cardCount(), 80);
    find((p) => Object.hasOwn(p, "data-inventory-more")).props.onClick();
    render();
    assert.equal(cardCount(), 81, "all records remain reachable");
    assert.equal(
      find((p) => Object.hasOwn(p, "data-inventory-more")),
      undefined,
    );
    find((p) => p["aria-label"] === "Buscar en inventario").props.onChange({
      target: { value: "zzqa0080" },
    });
    render();
    assert.equal(cardCount(), 1);
    assert.equal(
      card().props["data-inventory-product"],
      "qa-extra-80",
      "search includes not-yet-mounted records",
    );
    find((p) => p["aria-label"] === "Buscar en inventario").props.onChange({
      target: { value: "" },
    });
    render();
    assert.equal(cardCount(), 40, "clearing search resets to a bounded batch");
    find((p) => p.children === "Agotados").props.onClick();
    render();
    assert.equal(cardCount(), 40);
    find((p) => p.children === "Disponibles").props.onClick();
    render();
    assert.equal(cardCount(), 1);
    find((p) => p.children === "Todos").props.onClick();
    render();
    assert.equal(cardCount(), 40);
    const category = () =>
      find((p) => Array.isArray(p.products) && p.onChange && p.value);
    category().props.onChange("BATERIA");
    render();
    assert.equal(cardCount(), 0);
    category().props.onChange("DISPLAY");
    render();
    assert.equal(
      cardCount(),
      40,
      "returning from empty batteries never mounts the entire display catalog",
    );
    assert.equal(
      calls.filter((c) => !c.options).length,
      getCount,
      "filters and scrolling do not fetch again",
    );
  } finally {
    for (const effect of effects) effect?.cleanup?.();
    Object.assign(global, previousGlobals);
  }
});
