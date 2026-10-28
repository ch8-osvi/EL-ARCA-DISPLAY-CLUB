"use client";
import { CategoryDetails } from "@/components/ProductIdentity";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Copy, Plus, Search, Trash2, X } from "lucide-react";
import { Product } from "@/lib/types";
import { fuzzyMatchProduct } from "@/lib/searchUtils";
import {
  BoxLabelDraft,
  BoxIssues,
  boxTotal,
  parseQty,
  productLabel,
} from "@/lib/labelLayout";

export type StockFilter = "stock" | "all";

interface BoxEditorProps {
  box: BoxLabelDraft;
  index: number;
  products: Product[];
  productsById: Map<string, Product>;
  stockFilter: StockFilter;
  issues: BoxIssues;
  showErrors: boolean;
  overflow: boolean;
  totalsAcrossBoxes: Map<string, number>;
  onAddLine: (boxUid: string, product: Product, qty: number) => void;
  onLineQtyChange: (boxUid: string, lineUid: string, qty: string) => void;
  onRemoveLine: (boxUid: string, lineUid: string) => void;
  onNoteChange: (boxUid: string, note: string) => void;
  onDuplicate: (boxUid: string) => void;
  onRemove: (boxUid: string) => void;
}

const MAX_RESULTS = 40;

export default function BoxEditor({
  box,
  index,
  products,
  productsById,
  stockFilter,
  issues,
  showErrors,
  overflow,
  totalsAcrossBoxes,
  onAddLine,
  onLineQtyChange,
  onRemoveLine,
  onNoteChange,
  onDuplicate,
  onRemove,
}: BoxEditorProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
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
      setPickerError("Selecciona un modelo del inventario.");
      return;
    }
    const n = parseQty(qty);
    if (n === null) {
      setPickerError("La cantidad debe ser un número entero mayor que 0.");
      return;
    }
    onAddLine(box.uid, selected, n);
    setSelected(null);
    setSearch("");
    setQty("");
    setPickerError(null);
  };

  const hasErrors =
    issues.errors.length > 0 || Object.keys(issues.lineErrors).length > 0;
  const total = boxTotal(box);
  const idBase = `box-${index}`;

  return (
    <article
      id={`label-box-${box.uid}`}
      className={`glass-panel rounded-2xl p-4 sm:p-5 border transition-colors ${
        showErrors && hasErrors ? "border-rose-500/60" : "border-[#D4AF37]/25"
      }`}
    >
      {/* Cabecera de la caja */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-lg gold-gradient-bg text-black font-extrabold text-sm">
            Caja {index}
          </span>
          <span className="text-xs text-gray-400">
            {box.lines.length} {box.lines.length === 1 ? "modelo" : "modelos"} ·{" "}
            <strong className="text-white">{total}</strong>{" "}
            {total === 1 ? "pieza" : "piezas"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            id={`${idBase}-duplicate`}
            type="button"
            onClick={() => onDuplicate(box.uid)}
            title="Duplicar caja"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            id={`${idBase}-remove`}
            type="button"
            onClick={() => onRemove(box.uid)}
            title="Quitar etiqueta"
            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Nota opcional */}
      <input
        id={`${idBase}-note`}
        type="text"
        value={box.note}
        maxLength={40}
        onChange={(e) => onNoteChange(box.uid, e.target.value)}
        placeholder="Nota opcional (ej. Estante A)"
        className="w-full mb-4 px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-xs focus:outline-none focus:border-[#D4AF37] transition-all"
      />

      {/* Líneas */}
      {box.lines.length > 0 && (
        <ul className="space-y-2 mb-4">
          {box.lines.map((line) => {
            const err = issues.lineErrors[line.uid];
            const product = productsById.get(line.productId);
            const across = totalsAcrossBoxes.get(line.productId) ?? 0;
            const overStock = product && across > (product.stock ?? 0);
            return (
              <li
                key={line.uid}
                className={`rounded-xl px-3 py-2 border ${
                  err
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-white/10 bg-[#10131E]/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {productLabel(line.snapshot)}
                    </p>
                    <CategoryDetails category={product?.categoria} />
                    <p className="text-[11px] text-[#E5C158] truncate">
                      {line.snapshot.calidad}
                    </p>
                  </div>
                  <label className="sr-only" htmlFor={`qty-${line.uid}`}>
                    Cantidad
                  </label>
                  <input
                    id={`qty-${line.uid}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={line.qty}
                    onChange={(e) =>
                      onLineQtyChange(box.uid, line.uid, e.target.value)
                    }
                    className={`w-20 px-2 py-1.5 bg-[#090A0F] border rounded-lg text-white text-sm text-center focus:outline-none transition-all ${
                      err
                        ? "border-rose-500/70"
                        : "border-white/10 focus:border-[#D4AF37]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveLine(box.uid, line.uid)}
                    title="Quitar línea"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {err && <p className="text-[11px] text-rose-300 mt-1">{err}</p>}
                {!err && overStock && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    Aviso: en todas las etiquetas suman {across} uds y el stock
                    registrado es {product.stock ?? 0}.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Selector de producto */}
      <div className="rounded-xl border border-dashed border-white/15 p-3 space-y-2 relative z-30">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              id={`${idBase}-search`}
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
                  : "Buscar en todo el inventario…"
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
          <input
            id={`${idBase}-qty`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setPickerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Cant."
            className="w-full sm:w-24 px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm text-center focus:outline-none focus:border-[#D4AF37] transition-all"
          />
          <button
            id={`${idBase}-add-line`}
            type="button"
            onClick={handleAdd}
            className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-[#E5C158] border border-[#D4AF37]/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        </div>
        {pickerError && (
          <p className="text-[11px] text-rose-300">{pickerError}</p>
        )}
      </div>

      {/* Avisos de la caja */}
      {(showErrors || box.lines.length > 0) &&
        issues.errors.map((e) => (
          <p
            key={e}
            className="mt-3 text-xs text-rose-300 flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {e}
          </p>
        ))}
      {!showErrors && box.lines.length === 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Añade al menos un modelo a esta caja.
        </p>
      )}
      {overflow && (
        <p className="mt-3 text-xs text-amber-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Demasiados modelos para este tamaño: el texto se corta. Agranda la
          etiqueta o reparte en otra caja.
        </p>
      )}
    </article>
  );
}
