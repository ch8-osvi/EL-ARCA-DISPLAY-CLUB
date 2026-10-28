"use client";
import { CategoryDetails } from "@/components/ProductIdentity";

import React, { useMemo, useState } from "react";
import { AlertCircle, Plus, Search, Trash2, X } from "lucide-react";
import { Product } from "@/lib/types";
import { fuzzyMatchProduct } from "@/lib/searchUtils";
import { productLabel } from "@/lib/labelLayout";
import { StockFilter } from "./BoxEditor";

export interface SingleStickerItem {
  uid: string;
  productId: string;
  product: Product;
  copies: number;
}

interface SingleStickersManagerProps {
  products: Product[];
  stockFilter: StockFilter;
  items: SingleStickerItem[];
  onAddItem: (product: Product, copies: number) => void;
  onUpdateCopies: (uid: string, copies: number) => void;
  onRemoveItem: (uid: string) => void;
  onAddFromStock: (brand?: string) => void;
  onClearAll: () => void;
}

const MAX_RESULTS = 40;

export default function SingleStickersManager({
  products,
  stockFilter,
  items,
  onAddItem,
  onUpdateCopies,
  onRemoveItem,
  onAddFromStock,
  onClearAll,
}: SingleStickersManagerProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [copies, setCopies] = useState("1");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const pool =
      stockFilter === "stock"
        ? products.filter((p) => (p.stock ?? 0) > 0)
        : products;
    const term = search.trim();
    if (!term) {
      return [...pool]
        .sort((a, b) =>
          `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`),
        )
        .slice(0, MAX_RESULTS);
    }
    return pool
      .map((p) => ({ p, ...fuzzyMatchProduct(p, term) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.p);
  }, [products, search, stockFilter]);

  const handleAdd = () => {
    if (!selected) {
      setPickerError("Selecciona un modelo del catálogo.");
      return;
    }
    const n = parseInt(copies, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setPickerError("Ingresa un número de stickers válido (> 0).");
      return;
    }
    onAddItem(selected, n);
    setSelected(null);
    setSearch("");
    setCopies("1");
    setPickerError(null);
  };

  const totalStickers = items.reduce((acc, it) => acc + it.copies, 0);

  return (
    <div className="space-y-4">
      {/* Selector Rápido */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-[#D4AF37]/30 space-y-3 relative z-30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Añadir repuestos para stickers individuales
          </h3>
          <span className="text-xs text-gray-400">
            Total stickers a imprimir:{" "}
            <strong className="text-[#E5C158]">{totalStickers}</strong>
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={
                selected
                  ? `${productLabel(selected)} · ${selected.calidad}`
                  : search
              }
              onChange={(e) => {
                setSelected(null);
                setSearch(e.target.value);
                setOpen(true);
                setPickerError(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={
                stockFilter === "stock"
                  ? "Buscar modelo con stock…"
                  : "Buscar en todo el catálogo…"
              }
              autoComplete="off"
              className="w-full pl-9 pr-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
            />
            {open && !selected && (
              <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[#D4AF37]/40 bg-[#0D0F17] shadow-2xl shadow-black">
                {results.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-gray-400">
                    Sin resultados
                    {stockFilter === "stock"
                      ? ' con stock. Prueba el filtro "Todos".'
                      : "."}
                  </li>
                ) : (
                  results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelected(p);
                          // Por defecto sugerir la cantidad de su stock si tiene
                          if ((p.stock ?? 0) > 0) setCopies(String(p.stock));
                          setOpen(false);
                          setPickerError(null);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#D4AF37]/10 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-white font-semibold truncate">
                            {productLabel(p)}
                          </span>
                          <CategoryDetails category={p.categoria} />
                          <span className="block text-[11px] text-[#E5C158] truncate">
                            {p.calidad}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            (p.stock ?? 0) > 0
                              ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
                              : "text-gray-400 border-white/10 bg-white/5"
                          }`}
                        >
                          {(p.stock ?? 0) > 0 ? `Stock ${p.stock}` : "Agotado"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-400 font-semibold shrink-0">
              Stickers:
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={copies}
              onChange={(e) => {
                setCopies(e.target.value);
                setPickerError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              className="w-20 px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm text-center focus:outline-none focus:border-[#D4AF37] transition-all"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 rounded-xl gold-gradient-bg text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-105 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>
        </div>

        {pickerError && (
          <p className="text-[11px] text-rose-300">{pickerError}</p>
        )}

        {/* Acciones de Llenado Rápido */}
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Atajos rápidos:</span>
            <button
              type="button"
              onClick={() => onAddFromStock()}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition-all"
            >
              + Cargar Todo el Stock Disponible
            </button>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-gray-400 hover:text-rose-300 transition-colors"
            >
              Limpiar lista de stickers
            </button>
          )}
        </div>
      </div>

      {/* Listado de Productos Agregados para Stickers */}
      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 border border-dashed border-white/15 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-gray-500 mx-auto" />
          <h4 className="text-sm font-bold text-gray-300">
            No hay stickers en la lista
          </h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Busca un modelo arriba para generar sus stickers individuales de 4×2
            cm listos para bolsitas.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.uid}
              className="glass-panel rounded-xl p-3 border border-white/10 flex items-center justify-between gap-3 bg-[#10131E]/60"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white truncate">
                  {productLabel(item.product)}
                </span>
                <CategoryDetails category={item.product.categoria} />
                <span className="block text-[11px] text-[#E5C158] truncate">
                  {item.product.calidad}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">Cant:</span>
                  <input
                    type="number"
                    min={1}
                    value={item.copies}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      onUpdateCopies(
                        item.uid,
                        Number.isFinite(val) && val > 0 ? val : 1,
                      );
                    }}
                    className="w-16 px-2 py-1 bg-[#090A0F] border border-white/10 rounded-lg text-white text-xs text-center focus:outline-none focus:border-[#D4AF37]"
                  />
                  <span className="text-[10px] text-gray-400">stickers</span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(item.uid)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
