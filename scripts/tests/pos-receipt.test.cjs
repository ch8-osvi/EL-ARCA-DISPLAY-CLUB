const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { loadSource } = require("./helpers/load-source.cjs");
const { customerPhone, saleReceiptText } = loadSource("src/lib/saleReceipt.ts");
const sale = {
  orderNumber: "QA-2026-001",
  clientName: "Taller de prueba",
  createdAt: "2026-10-30T15:30:00Z",
  currency: "CUP",
  exchangeRate: 835,
  totalUSD: 26.5,
  totalCUP: 22100,
  paid: false,
  status: "COMPLETED",
  notes: "NOTA PRIVADA NO ENVIAR",
  items: [
    {
      marca: "XIAOMI",
      modelo: "REDMI NOTE 8 PRO",
      calidad: "ORIGINAL S/M",
      qty: 2,
      precioUSD: 13.25,
      subtotalUSD: 26.5,
    },
  ],
};
test("POS: WhatsApp normaliza país y rechaza objetos, letras, JID y números inválidos", () => {
  for (const [input, expected] of [
    ["51234567", "5351234567"],
    ["+53 5123 4567", "5351234567"],
    ["005351234567", "5351234567"],
    ["+1 (202) 555-0123", "12025550123"],
    ["", ""],
    ["   ", ""],
    [undefined, ""],
  ])
    assert.equal(customerPhone(input), expected);
  for (const input of [
    { to: "5351234567" },
    "pepe51234567",
    "5351234567@s.whatsapp.net",
    "123",
    "000000000000",
    "1".repeat(16),
  ])
    assert.throws(() => customerPhone(input));
});
test("comprobante: usa importes y tasa guardados, distingue pendiente y nunca revela notas internas", () => {
  const text = saleReceiptText(sale);
  assert.match(text, /QA-2026-001/);
  assert.match(text, /PENDIENTE DE PAGO/);
  assert.match(text, /22,100.00 CUP/);
  assert.match(text, /26.50 USD/);
  assert.match(text, /835.00 CUP/);
  assert.match(text, /2 × 13.25 USD = 26.50 USD/);
  assert.doesNotMatch(text, /NOTA PRIVADA|ORIGINAL S\/M/);
  assert.match(saleReceiptText({ ...sale, paid: true }), /Estado: PAGADO/);
});
test("comprobante: devoluciones y anulación no aparentan una venta pagada vigente", () => {
  const partial = saleReceiptText({
    ...sale,
    status: "PARTIALLY_REFUNDED",
    totalRefundedCUP: 11050,
    totalRefundedUSD: 13.25,
    items: [{ ...sale.items[0], returnedQty: 1 }],
  });
  assert.match(partial, /DEVOLUCIÓN PARCIAL/);
  assert.match(partial, /Importe neto: 11,050.00 CUP/);
  assert.match(partial, /Devueltas: 1/);
  assert.match(
    saleReceiptText({ ...sale, status: "CANCELLED" }),
    /no acredita un cobro vigente/,
  );
  assert.match(
    saleReceiptText({ ...sale, status: "REFUNDED", totalRefundedCUP: 22100 }),
    /Importe neto: 0.00 CUP/,
  );
});
test("comprobante: contenido acotado y sin saltos o marcado inyectados en nombres", () => {
  const text = saleReceiptText({
    ...sale,
    clientName: "Ana\n*PAGADO*",
    items: [{ ...sale.items[0], modelo: "X".repeat(2000) }],
  });
  assert.match(text, /Cliente: Ana PAGADO/);
  assert.match(text, /…/);
  assert.ok(text.length < 20000);
  assert.throws(() => saleReceiptText({ ...sale, createdAt: "invalida" }));
});
const icons = new Proxy({}, { get: () => () => null });
const { default: Controls } = loadSource(
  "src/components/PosCheckoutControls.tsx",
  { "lucide-react": icons },
);
const options = {
  clientName: "",
  clientPhone: "",
  currency: "USD",
  paid: true,
  notes: "",
  copies: 1,
  printMode: "bluetooth",
};
const html = (patch = {}) =>
  renderToStaticMarkup(
    React.createElement(Controls, {
      value: { ...options, ...patch },
      onChange() {},
      subtotalUSD: 26.5,
      totalCUP: 22100,
      rate: 835,
      itemCount: 2,
      submitting: false,
      onCheckout() {},
    }),
  );
test("POS: la moneda elegida gobierna el total principal y el equivalente conserva jerarquía", () => {
  const usd = html(),
    cup = html({ currency: "CUP" });
  assert.ok(usd.indexOf("$26.50") < usd.indexOf("22,100.00"));
  assert.ok(cup.indexOf("22,100.00") < cup.indexOf("$26.50"));
  assert.match(usd, /data-pos-secondary-total/);
  assert.match(usd, /text-xl/);
});
test("POS: cliente y teléfono accesibles, impresión compacta y notas debajo de las copias", () => {
  const text = html();
  assert.match(text, /pos-client-name/);
  assert.match(text, /pos-client-phone/);
  assert.match(text, /type="tel"/);
  assert.match(text, /grid-cols-2/);
  assert.ok(text.indexOf("Copias del ticket") < text.indexOf("pos-notes"));
  assert.match(text, /aria-label="Imprimir por Bluetooth"/);
  assert.match(text, /no se incluyen en WhatsApp/);
});
