'use client';

import React from 'react';
import { Search, X, ArrowUpDown, Filter } from 'lucide-react';
import { SortOption } from '@/lib/types';

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedQuality: string;
  onQualityChange: (quality: string) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  qualities: string[];
}

export default function SearchBar({
  searchTerm,
  onSearchChange,
  selectedQuality,
  onQualityChange,
  sortOption,
  onSortChange,
  qualities,
}: SearchBarProps) {
  return (
    <div className="w-full flex flex-col md:flex-row items-center gap-3">
      {/* Real-time search input */}
      <div className="relative w-full flex-1">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-[#D4AF37]" />
        </div>
        <input
          id="input-search-catalog"
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar display por modelo, repuesto, código o marca... (ej. A02, OLED, Samsung)"
          className="w-full pl-11 pr-10 py-3.5 bg-[#10131E] border border-[#D4AF37]/25 rounded-2xl text-white placeholder-gray-400 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition-all duration-200 shadow-inner"
        />
        {searchTerm && (
          <button
            id="btn-clear-search"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-white transition-colors"
            title="Limpiar búsqueda"
          >
            <X className="w-4 h-4 bg-gray-800 rounded-full p-0.5" />
          </button>
        )}
      </div>

      {/* Dropdown Filters */}
      <div className="w-full md:w-auto flex items-center gap-2">
        {/* Quality Filter */}
        <div className="relative flex-1 md:flex-initial">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Filter className="w-4 h-4 text-gray-400" />
          </div>
          <select
            id="select-quality-filter"
            value={selectedQuality}
            onChange={(e) => onQualityChange(e.target.value)}
            className="w-full pl-9 pr-8 py-3.5 bg-[#10131E] border border-white/10 rounded-2xl text-white text-xs font-semibold focus:outline-none focus:border-[#D4AF37] transition-all cursor-pointer appearance-none"
          >
            <option value="ALL">Todas las Calidades</option>
            {qualities.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Option */}
        <div className="relative flex-1 md:flex-initial">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <ArrowUpDown className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <select
            id="select-sort-option"
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="w-full pl-9 pr-8 py-3.5 bg-[#10131E] border border-white/10 rounded-2xl text-white text-xs font-semibold focus:outline-none focus:border-[#D4AF37] transition-all cursor-pointer appearance-none"
          >
            <option value="price-asc">Precio: Menor a Mayor</option>
            <option value="price-desc">Precio: Mayor a Menor</option>
            <option value="brand-asc">Marca: A - Z</option>
            <option value="model-asc">Modelo: A - Z</option>
          </select>
        </div>
      </div>
    </div>
  );
}
