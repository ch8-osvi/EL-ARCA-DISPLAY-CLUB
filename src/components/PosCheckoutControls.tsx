"use client";
import {
  Bluetooth,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Printer,
  Usb,
} from "lucide-react";
import { receiptMoney } from "@/lib/saleReceipt";
export type CheckoutOptions = {
  clientName: string;
  clientPhone: string;
  currency: "USD" | "CUP";
  paid: boolean;
  notes: string;
  copies: number;
  printMode: "bluetooth" | "usb" | "system";
};
const printers = [
  { id: "bluetooth" as const, label: "Bluetooth", Icon: Bluetooth },
  { id: "usb" as const, label: "USB / Serial", Icon: Usb },
  { id: "system" as const, label: "Sistema", Icon: Printer },
];
const field =
  "mt-1.5 w-full min-w-0 rounded-xl border border-white/10 bg-[#10131E] px-3 py-2.5 text-base text-white placeholder-gray-600 outline-none transition-colors focus:border-[#D4AF37] disabled:opacity-60";
export default function PosCheckoutControls({
  value,
  onChange,
  subtotalUSD,
  totalCUP,
  rate,
  itemCount,
  submitting,
  onCheckout,
}: {
  value: CheckoutOptions;
  onChange: (patch: Partial<CheckoutOptions>) => void;
  subtotalUSD: number;
  totalCUP: number;
  rate: number | null;
  itemCount: number;
  submitting: boolean;
  onCheckout: (print: boolean) => void;
}) {
  const cupAvailable = Number.isFinite(totalCUP);
  const primary =
    value.currency === "USD"
      ? `$${receiptMoney(subtotalUSD)}`
      : cupAvailable
        ? receiptMoney(totalCUP)
        : "—";
  const secondary =
    value.currency === "USD"
      ? cupAvailable
        ? receiptMoney(totalCUP)
        : "—"
      : `$${receiptMoney(subtotalUSD)}`;
  return (
    <fieldset
      disabled={submitting}
      className="min-w-0 space-y-4 border-t border-white/10 pt-4"
    >
      <legend className="sr-only">
        Datos del cliente y opciones de la venta
      </legend>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label
          htmlFor="pos-client-name"
          className="min-w-0 text-xs font-semibold text-gray-300"
        >
          Cliente / taller
          <input
            id="pos-client-name"
            value={value.clientName}
            onChange={(e) => onChange({ clientName: e.target.value })}
            autoComplete="name"
            maxLength={200}
            placeholder="Nombre o taller"
            className={field}
          />
        </label>
        <label
          htmlFor="pos-client-phone"
          className="min-w-0 text-xs font-semibold text-gray-300"
        >
          WhatsApp
          <input
            id="pos-client-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            value={value.clientPhone}
            onChange={(e) => onChange({ clientPhone: e.target.value })}
            placeholder="+53 5123 4567"
            className={field}
          />
        </label>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-500">
        Datos opcionales. WhatsApp con código de país; a 8 dígitos locales se
        añade +53.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-gray-300">
            Moneda de pago
          </span>
          <div
            role="group"
            aria-label="Moneda de pago de la orden"
            className="flex rounded-xl border border-white/10 bg-[#10131E] p-1"
          >
            {(["USD", "CUP"] as const).map((currency) => (
              <button
                key={currency}
                type="button"
                aria-pressed={value.currency === currency}
                onClick={() => onChange({ currency })}
                className={`min-h-10 flex-1 rounded-lg text-sm font-bold transition-colors ${value.currency === currency ? "gold-gradient-bg text-black" : "text-gray-400 hover:text-white"}`}
              >
                {currency === "USD" ? "USD $" : "CUP"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-gray-300">
            Estado de pago
          </span>
          <button
            type="button"
            aria-label={
              value.paid
                ? "Pago registrado como pagado"
                : "Pago registrado como pendiente"
            }
            aria-pressed={value.paid}
            onClick={() => onChange({ paid: !value.paid })}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-2 text-sm font-bold transition-colors ${value.paid ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}
          >
            {value.paid ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <Clock3 className="h-4 w-4 shrink-0" />
            )}
            {value.paid ? "Pagado" : "Pendiente"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-white/10 bg-[#10131E]/70 p-3">
        <div className="min-w-0">
          <span className="mb-2 block text-xs font-semibold text-gray-300">
            Impresora
          </span>
          <div
            role="group"
            aria-label="Conexión de la impresora"
            className="flex gap-1"
          >
            {printers.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={`Imprimir por ${label}`}
                aria-pressed={value.printMode === id}
                onClick={() => onChange({ printMode: id })}
                className={`flex h-10 w-9 items-center justify-center rounded-lg border transition-colors ${value.printMode === id ? "border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#F3E0A9]" : "border-white/5 bg-white/[0.03] text-gray-500 hover:text-white"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <span className="mt-1.5 block text-[11px] text-gray-400">
            {printers.find((p) => p.id === value.printMode)?.label}
          </span>
        </div>
        <div>
          <span className="mb-2 block text-xs font-semibold text-gray-300">
            Copias del ticket
          </span>
          <div
            role="group"
            aria-label="Copias del ticket"
            className="flex gap-1"
          >
            {[1, 2, 3].map((copies) => (
              <button
                key={copies}
                type="button"
                aria-label={`${copies} ${copies === 1 ? "copia" : "copias"}`}
                aria-pressed={value.copies === copies}
                onClick={() => onChange({ copies })}
                className={`h-10 w-7 rounded-lg text-sm font-bold transition-colors ${value.copies === copies ? "gold-gradient-bg text-black" : "border border-white/10 text-gray-400 hover:text-white"}`}
              >
                {copies}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label
        htmlFor="pos-notes"
        className="block text-xs font-semibold text-gray-300"
      >
        Observaciones del ticket{" "}
        <span className="font-normal text-gray-500">(opcional)</span>
        <textarea
          id="pos-notes"
          rows={2}
          maxLength={4000}
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Garantía, entrega u otras observaciones…"
          className={`${field} resize-y`}
        />
        <span className="mt-1 block text-[11px] font-normal leading-relaxed text-gray-500">
          Se imprimen en el ticket; no se incluyen en WhatsApp.
        </span>
      </label>
      <div
        aria-label="Resumen de cobro"
        className="min-w-0 overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#D4AF37]/[0.08] to-[#10131E] p-4 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-gray-400">
          <span>
            {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
          </span>
          <span>
            {rate ? `1 USD = ${receiptMoney(rate)} CUP` : "Tasa no disponible"}
          </span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400">
          Total a pagar
        </p>
        <div
          data-pos-primary-total
          className={`mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 tabular-nums ${value.currency === "CUP" ? "text-emerald-200" : "text-[#F3E0A9]"}`}
        >
          <strong className="min-w-0 break-all text-3xl font-extrabold leading-tight sm:text-4xl">
            {primary}
          </strong>
          <span className="text-sm font-bold">{value.currency}</span>
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          <span className="text-[11px] text-gray-400">
            Equivalente en {value.currency === "USD" ? "CUP" : "USD"}
          </span>
          <div
            data-pos-secondary-total
            className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 tabular-nums text-gray-200"
          >
            <strong className="min-w-0 break-all text-xl font-semibold">
              {secondary}
            </strong>
            <span className="text-xs font-semibold">
              {value.currency === "USD" ? "CUP" : "USD"}
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onCheckout(true)}
          disabled={!itemCount || submitting || !rate}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl gold-gradient-bg px-3 py-3 text-sm font-extrabold text-black transition-opacity disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          {submitting ? "Registrando venta…" : "Registrar e imprimir ticket"}
        </button>
        <button
          type="button"
          onClick={() => onCheckout(false)}
          disabled={!itemCount || submitting || !rate}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <CreditCard className="h-4 w-4" />
          Registrar sin imprimir
        </button>
        <p className="pt-1 text-center text-[11px] leading-relaxed text-gray-500">
          Después de registrar podrás enviar el comprobante por WhatsApp.
        </p>
      </div>
    </fieldset>
  );
}
