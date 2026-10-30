import { productQuality } from "./categories";

/** Explicit international numbers or a local Cuban number, never JIDs or free text. */
export function customerPhone(value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  )
    return "";
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\+?[\d\s().-]+$/.test(value.trim())
  )
    throw new Error(
      "Escribe un WhatsApp válido con código de país, por ejemplo +53 5123 4567.",
    );
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 8 && !raw.startsWith("+")) digits = "53" + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new Error(
      "El WhatsApp debe tener entre 8 y 15 dígitos, con código de país.",
    );
  return digits;
}

export type ReceiptSale = {
  orderNumber: string;
  clientName: string;
  clientPhone?: string;
  createdAt: string | Date;
  currency: "USD" | "CUP";
  exchangeRate: number;
  totalUSD: number;
  totalCUP: number;
  totalRefundedUSD?: number;
  totalRefundedCUP?: number;
  paid: boolean;
  status?: string;
  items: {
    marca: string;
    modelo: string;
    calidad: string;
    qty: number;
    returnedQty?: number;
    precioUSD: number;
    subtotalUSD: number;
  }[];
};
const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const receiptMoney = (value: number) => number.format(value);
const line = (value: string, max = 120) => {
  const clean = value
    .replace(/[\u0000-\u001f\u007f*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
};

/** Only persisted financial values. Internal notes never enter the customer message. */
export function saleReceiptText(sale: ReceiptSale): string {
  const date = new Date(sale.createdAt);
  if (
    !Number.isFinite(date.getTime()) ||
    !sale.items.length ||
    sale.items.length > 100 ||
    ![sale.totalUSD, sale.totalCUP, sale.exchangeRate].every(Number.isFinite)
  )
    throw new Error("No se pudo preparar el comprobante de esta venta.");
  const state = sale.status || "COMPLETED";
  const labels: Record<string, string> = {
    COMPLETED: sale.paid ? "PAGADO" : "PENDIENTE DE PAGO",
    PARTIALLY_REFUNDED: "DEVOLUCIÓN PARCIAL",
    REFUNDED: "DEVUELTO EN SU TOTALIDAD",
    CANCELLED: "VENTA ANULADA",
  };
  if (!labels[state]) throw new Error("Estado de venta inválido.");
  const rows = [
    "*EL ARCA DISPLAY CLUB*",
    "COMPROBANTE DE VENTA",
    "",
    `*Orden #${line(sale.orderNumber)}*`,
    new Intl.DateTimeFormat("es-CU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Havana",
    }).format(date),
    `Cliente: ${line(sale.clientName || "Consumidor final")}`,
    `Estado: ${labels[state]}`,
    "",
    "*Detalle de la compra*",
  ];
  sale.items.forEach((item, index) => {
    rows.push(
      `${index + 1}. ${line(`${item.marca} ${item.modelo}`, 100)} · ${line(productQuality(item.calidad), 30)}`,
      `   ${item.qty} × ${receiptMoney(item.precioUSD)} USD = ${receiptMoney(item.subtotalUSD)} USD`,
    );
    if (item.returnedQty)
      rows.push(`   Devueltas: ${item.returnedQty} unidades`);
  });
  rows.push(
    "",
    `*Total de la venta: ${receiptMoney(sale.currency === "CUP" ? sale.totalCUP : sale.totalUSD)} ${sale.currency}*`,
    `Equivalente: ${receiptMoney(sale.currency === "CUP" ? sale.totalUSD : sale.totalCUP)} ${sale.currency === "CUP" ? "USD" : "CUP"}`,
    `Tasa aplicada: 1 USD = ${receiptMoney(sale.exchangeRate)} CUP`,
  );
  if (state === "CANCELLED")
    rows.push(
      "*Venta anulada. Este comprobante no acredita un cobro vigente.*",
    );
  else if (state !== "COMPLETED") {
    const refunded =
      sale.currency === "CUP"
        ? sale.totalRefundedCUP || 0
        : sale.totalRefundedUSD || 0;
    const total = sale.currency === "CUP" ? sale.totalCUP : sale.totalUSD;
    rows.push(
      `Devuelto: ${receiptMoney(refunded)} ${sale.currency}`,
      `Importe neto: ${receiptMoney(Math.max(0, total - refunded))} ${sale.currency}`,
      `Pago: ${sale.paid ? "Pagado" : "Pendiente"}`,
    );
  }
  rows.push(
    "",
    "Conserva este número de orden para cualquier consulta.",
    "Gracias por tu compra.",
  );
  const text = rows.join("\n");
  if (text.length > 20000)
    throw new Error(
      "El comprobante supera el tamaño permitido para un mensaje.",
    );
  return text;
}
