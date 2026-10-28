"use client";
import {
  BatteryCharging,
  Smartphone,
  Layers,
  Cable,
  LayoutGrid,
} from "lucide-react";
import {
  CATEGORIES,
  productCategory,
  type ProductCategory,
} from "@/lib/categories";
const icons = {
  DISPLAY: Smartphone,
  BATERIA: BatteryCharging,
  TAPA: Layers,
  ACCESORIO: Cable,
};
export default function CategoryFilter({
  products,
  value,
  onChange,
  publicCatalog = false,
  loading = false,
}: {
  products: { categoria?: unknown }[];
  value: ProductCategory | "ALL";
  onChange: (value: ProductCategory | "ALL") => void;
  publicCatalog?: boolean;
  loading?: boolean;
}) {
  if (loading)
    return (
      <section
        aria-label="Cargando categorías"
        aria-busy="true"
        className="space-y-3 animate-pulse"
      >
        <div className="h-4 w-44 rounded bg-white/10" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`${i === 0 ? "col-span-2 sm:col-span-1" : ""} h-[78px] sm:h-[105px] rounded-2xl border border-white/5 bg-[#10131E]`}
            />
          ))}
        </div>
      </section>
    );
  const counts = new Map(
    CATEGORIES.map((c) => [
      c.id,
      products.filter((p) => productCategory(p.categoria) === c.id).length,
    ]),
  );
  return (
    <section aria-label="Categorías del catálogo" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
          ¿Qué estás buscando?
        </h2>
        <span className="text-[11px] text-gray-500">
          {products.length} repuestos
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          {
            id: "ALL" as const,
            label: "Todo el catálogo",
            description: "Explora todos los repuestos",
            count: products.length,
            Icon: LayoutGrid,
          },
          ...CATEGORIES.map((c) => ({
            ...c,
            count: counts.get(c.id) || 0,
            Icon: icons[c.id],
          })),
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            disabled={publicCatalog && c.count === 0}
            onClick={() => onChange(c.id)}
            className={`${c.id === "ALL" ? "col-span-2 sm:col-span-1" : ""} min-w-0 rounded-2xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] disabled:opacity-40 ${value === c.id ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 shadow-gold-glow" : "border-white/10 bg-[#10131E] hover:border-[#D4AF37]/30 hover:bg-white/5"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <c.Icon
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 ${value === c.id ? "text-[#E5C158]" : "text-gray-400"}`}
              />
              <span className="text-[10px] font-bold text-gray-500">
                {c.count || (publicCatalog ? "Sin existencias" : "0")}
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-white">{c.label}</div>
            <p className="mt-1 hidden text-[10px] leading-relaxed text-gray-500 sm:block">
              {c.description}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
