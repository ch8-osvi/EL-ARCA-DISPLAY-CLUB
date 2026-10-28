"use client";

import ProductPrice from "./ProductPrice";
import ProductIdentity from "./ProductIdentity";
import React, { useState } from "react";
import { Product } from "@/lib/types";
import { EyeOff, Tag } from "lucide-react";

interface AdminProductCardProps {
  product: Product;
  exchangeRate?: number | null;
  onDelete: (id: string) => void | Promise<boolean | void>;
}

export default function AdminProductCard({
  product,
  exchangeRate = null,
  onDelete,
}: AdminProductCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = async () => {
    setIsDeleting(true);
    try {
      if ((await onDelete(product.id)) !== true) setIsDeleting(false);
    } catch {
      setIsDeleting(false);
    }
  };

  const getQualityBadgeClass = (calidad: string) => {
    const q = calidad.toUpperCase();
    if (q.includes("C/M") || q.includes("MARCO")) return "badge-cm";
    if (q.includes("ORIGINAL")) return "badge-original";
    if (q.includes("INCELL")) return "badge-incell";
    if (q.includes("OLED")) return "badge-oled";
    return "badge-other";
  };

  return (
    <div
      className={`glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
        isDeleting ? "opacity-30 scale-95 pointer-events-none" : ""
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-lg bg-[#171B2B] border border-white/10 text-[11px] font-bold tracking-wide text-[#E5C158] uppercase flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-[#D4AF37]" />
            {product.marca}
          </span>
          <span
            className={`badge-quality ${getQualityBadgeClass(product.calidad)}`}
          >
            {product.calidad}
          </span>
        </div>

        <ProductIdentity
          model={product.modelo}
          category={product.categoria}
          className="mb-3"
        />
      </div>

      <div className="mt-4">
        {/* Stock text directly above the fine line of price */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="font-medium text-gray-400">Stock:</span>
          <span className="font-semibold text-gray-200">
            {product.stock <= 0 ? "Sin stock" : `${product.stock} uds.`}
          </span>
        </div>

        <div className="pt-3 border-t border-white/5 space-y-3">
          <ProductPrice
            priceUSD={product.precio}
            exchangeRate={exchangeRate}
            primaryCurrency="USD"
          />

          <div className="flex items-center justify-end gap-1.5">
            {/* Delete Trigger */}
            {!showConfirm ? (
              <button
                id={`btn-delete-trigger-${product.id}`}
                onClick={() => setShowConfirm(true)}
                className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all duration-200"
                title="Ocultar de catálogo"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ocultar</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  id={`btn-delete-confirm-${product.id}`}
                  onClick={handleDeleteClick}
                  className="px-2 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-md transition-all duration-150 whitespace-nowrap"
                >
                  Sí, Ocultar
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-2 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-medium transition-all duration-150"
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
