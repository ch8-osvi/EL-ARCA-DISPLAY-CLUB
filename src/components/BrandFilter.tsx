"use client";

import React from "react";

interface BrandFilterProps {
  brands: string[];
  selectedBrand: string;
  onBrandSelect: (brand: string) => void;
  brandCounts?: Map<string, number>;
  totalCount?: number;
}

export default function BrandFilter({
  brands,
  selectedBrand,
  onBrandSelect,
  brandCounts,
  totalCount,
}: BrandFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filtrar por marca"
      className="w-full min-w-0 overflow-x-auto px-1 py-2 scrollbar-none flex items-center gap-2"
    >
      <button
        type="button"
        id="filter-brand-all"
        aria-pressed={selectedBrand === "ALL"}
        onClick={() => onBrandSelect("ALL")}
        className={`shrink-0 border px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors duration-200 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37] ${
          selectedBrand === "ALL"
            ? "gold-gradient-bg text-black border-transparent"
            : "bg-[#10131E] text-gray-300 hover:text-white border-white/10 hover:border-white/20"
        }`}
      >
        <span>Todas las Marcas</span>
        {totalCount !== undefined && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
              selectedBrand === "ALL"
                ? "bg-black/20 text-black"
                : "bg-white/10 text-[#E5C158]"
            }`}
          >
            {totalCount}
          </span>
        )}
      </button>

      {brands.map((brand) => {
        const count = brandCounts?.get(brand);
        return (
          <button
            type="button"
            key={brand}
            aria-pressed={selectedBrand === brand}
            id={`filter-brand-${brand.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
            onClick={() => onBrandSelect(brand)}
            className={`shrink-0 border px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors duration-200 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37] ${
              selectedBrand === brand
                ? "gold-gradient-bg text-black border-transparent"
                : "bg-[#10131E] text-gray-300 hover:text-white border-white/10 hover:border-white/20"
            }`}
          >
            <span>{brand}</span>
            {count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                  selectedBrand === brand
                    ? "bg-black/20 text-black"
                    : "bg-white/10 text-[#E5C158]"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
