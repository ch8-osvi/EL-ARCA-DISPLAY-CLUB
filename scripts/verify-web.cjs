// Read-only HTTP audit. It never creates sales, changes stock or sends WhatsApp messages.
const assert = require("node:assert/strict");
require("dotenv").config({ path: ".env.local", quiet: true });
const base = new URL(process.argv[2] || "http://127.0.0.1:3000");
if (
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Usa una URL HTTP(S) sin credenciales");
const origin = base.origin;
let cookie;
let checks = 0;
async function request(path, options = {}) {
  return fetch(new URL(path, origin), {
    ...options,
    headers: { ...(cookie ? { cookie } : {}), ...options.headers },
    signal: AbortSignal.timeout(30000),
  });
}
async function json(path, options = {}) {
  const r = await request(path, options);
  assert.equal(r.status, 200, `${path}: HTTP ${r.status}`);
  const data = await r.json();
  assert.ok(!data.error, `${path}: respuesta con error`);
  checks++;
  return data;
}
const pages = [
  "/admin",
  "/admin/pos",
  "/admin/pos/inventario",
  "/admin/pos/historial",
  "/admin/duplicados",
  "/admin/ocultos",
  "/admin/etiquetas",
  "/admin/ia",
  "/admin/whatsapp",
];
const protectedApis = [
  "/api/products?all=true",
  "/api/products/hidden",
  "/api/sales",
  "/api/stock",
  "/api/analytics",
  "/api/duplicados/ignored",
  "/api/whatsapp/admin/config",
  "/api/whatsapp/admin/stats",
];
(async () => {
  for (const path of protectedApis) {
    assert.equal((await request(path)).status, 401, `Protección de ${path}`);
    checks++;
  }
  for (const path of [
    "/",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
  ]) {
    assert.equal((await request(path)).status, 200, path);
    checks++;
  }
  assert.equal((await request("/auditoria-pagina-inexistente")).status, 404);
  checks++;
  const catalog = await json("/api/products");
  const rate = await json("/api/exchange-rate");
  assert.ok(
    Number.isFinite(rate.rate) && rate.rate >= 1,
    "Tasa comercial inválida",
  );
  const contact = await json("/api/whatsapp/contact");
  assert.match(
    contact.phone || "",
    /^\d{8,15}$/,
    "Contacto WhatsApp no configurado",
  );
  assert.ok(Array.isArray(catalog.products));
  for (const product of catalog.products) {
    assert.ok(
      typeof product.id === "string" && typeof product.modelo === "string",
    );
    assert.ok(Number.isFinite(product.precio) && product.precio >= 0);
    assert.ok(Number.isSafeInteger(product.stock) && product.stock > 0);
    assert.ok(!product.isHidden);
    assert.doesNotMatch(
      product.calidad,
      /^(ORIGINAL|INCELL)\s+(?:S\/?M|SIN MARCO)$/i,
    );
  }
  const password = process.env.ADMIN_PASSWORD;
  assert.ok(password, "ADMIN_PASSWORD requerido para comprobar el panel");
  const login = await request("/api/auth/session", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200, "Acceso administrativo");
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "Falta cookie de sesión");
  checks++;
  try {
    for (const path of pages) {
      const response = await request(path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      checks++;
    }
    for (const path of protectedApis) await json(path);
    const session = await json("/api/auth/session");
    assert.equal(session.authenticated, true);
    const csrf = await request("/api/products", {
      method: "POST",
      headers: {
        origin: "https://auditoria.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(csrf.status, 403, "Protección de origen");
    checks++;
  } finally {
    const logout = await request("/api/auth/session", {
      method: "DELETE",
      headers: { origin },
    });
    assert.equal(logout.status, 200, "Cerrar sesión");
    assert.equal(
      (await request("/api/stock")).status,
      401,
      "Revocación de sesión",
    );
    cookie = undefined;
    checks += 2;
  }
  console.log(
    `PASS ${checks} comprobaciones HTTP en ${origin}; ${catalog.products.length} productos públicos válidos.`,
  );
})().catch((error) => {
  console.error("FAIL auditoría web:", error.message);
  process.exitCode = 1;
});
