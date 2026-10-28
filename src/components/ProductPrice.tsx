import type { Currency } from "@/lib/types";
import { roundCupPrice } from "@/lib/searchUtils";

/** One horizontal price pair for product cards; no checkout or currency state. */
export default function ProductPrice({
  priceUSD,
  exchangeRate,
  primaryCurrency = "CUP",
  compact = false,
  inlineAction = false,
  className = "",
}: {
  priceUSD: number;
  exchangeRate?: number | null;
  primaryCurrency?: Currency;
  compact?: boolean;
  inlineAction?: boolean;
  className?: string;
}) {
  const cup = roundCupPrice(priceUSD, exchangeRate ?? null);
  const cupAvailable = Number.isFinite(cup);
  const values = {
    CUP: cupAvailable ? cup.toLocaleString("es-CU") : "—",
    USD: `$${priceUSD.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
  };
  const characterCount = values.CUP.length + values.USD.length;
  const minimumWidth =
    characterCount > 18 ? 250 : characterCount > 12 ? 180 : 145;
  const secondaryCurrency = primaryCurrency === "CUP" ? "USD" : "CUP";
  return (
    <div
      className={`min-w-0 ${inlineAction ? "" : "w-full"}`}
      style={{
        containerType: "inline-size",
        ...(inlineAction
          ? {
              flex: `1 1 ${minimumWidth}px`,
              minWidth: `min(100%, ${minimumWidth}px)`,
            }
          : {}),
      }}
    >
      <div
        data-product-price
        className={`product-price-values ${values.CUP.length + values.USD.length > 12 ? "product-price-wide" : ""} flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 tabular-nums ${className}`}
        aria-label={`${values.USD} USD · ${cupAvailable ? `${values.CUP} CUP` : "Tasa CUP no disponible"}`}
      >
        <span className="product-price-amount inline-flex items-baseline gap-1 whitespace-nowrap">
          <span
            className={`product-price-number ${compact ? "text-lg" : "text-[22px]"} font-extrabold leading-none tracking-tight text-[#F3E0A9]`}
          >
            {values[primaryCurrency]}
          </span>
          <span className="product-price-unit text-[11px] font-semibold text-gray-400">
            {primaryCurrency}
          </span>
        </span>
        <span className="product-price-amount product-price-secondary inline-flex items-baseline gap-1 whitespace-nowrap border-l border-white/10 pl-3">
          <span
            className={`product-price-number ${compact ? "text-base" : "text-lg"} font-semibold leading-none tracking-tight text-gray-200`}
          >
            {values[secondaryCurrency]}
          </span>
          <span className="product-price-unit text-[11px] font-medium text-gray-400">
            {secondaryCurrency}
          </span>
        </span>
        {!cupAvailable && (
          <span className="w-full text-xs text-gray-400">
            Tasa CUP no disponible
          </span>
        )}
      </div>
    </div>
  );
}
