'use client';

import React from 'react';

interface BrandFilterProps {
  brands: string[];
  selectedBrand: string;
  onBrandSelect: (brand: string) => void;
}

export default function BrandFilter({
  brands,
  selectedBrand,
  onBrandSelect,
}: BrandFilterProps) {
  return (
    <div className="w-full overflow-x-auto py-2 scrollbar-none flex items-center gap-2">
      <button
        id="filter-brand-all"
        onClick={() => onBrandSelect('ALL')}
        className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
          selectedBrand === 'ALL'
            ? 'gold-gradient-bg text-black shadow-gold-glow scale-105'
            : 'bg-[#10131E] text-gray-300 hover:text-white border border-white/10 hover:border-white/20'
        }`}
      >
        Todas las Marcas
      </button>

      {brands.map((brand) => (
        <button
          key={brand}
          id={`filter-brand-${brand.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          onClick={() => onBrandSelect(brand)}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
            selectedBrand === brand
              ? 'gold-gradient-bg text-black shadow-gold-glow scale-105'
              : 'bg-[#10131E] text-gray-300 hover:text-white border border-white/10 hover:border-white/20'
          }`}
        >
          {brand}
        </button>
      ))}
    </div>
  );
}
