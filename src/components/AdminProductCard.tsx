'use client';

import React, { useState } from 'react';
import { Product } from '@/lib/types';
import { Trash2, Smartphone, Tag, Pencil } from 'lucide-react';

interface AdminProductCardProps {
  product: Product;
  onDelete: (id: string) => void;
  onEdit?: (product: Product) => void;
}

export default function AdminProductCard({ product, onDelete, onEdit }: AdminProductCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = () => {
    setIsDeleting(true);
    onDelete(product.id);
  };

  const getQualityBadgeClass = (calidad: string) => {
    const q = calidad.toUpperCase();
    if (q.includes('C/M') || q.includes('MARCO')) return 'badge-cm';
    if (q.includes('ORIGINAL')) return 'badge-original';
    if (q.includes('INCELL')) return 'badge-incell';
    if (q.includes('OLED')) return 'badge-oled';
    return 'badge-other';
  };

  return (
    <div
      className={`glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
        isDeleting ? 'opacity-30 scale-95 pointer-events-none' : ''
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-lg bg-[#171B2B] border border-white/10 text-[11px] font-bold tracking-wide text-[#E5C158] uppercase flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-[#D4AF37]" />
            {product.marca}
          </span>
          <span className={`badge-quality ${getQualityBadgeClass(product.calidad)}`}>
            {product.calidad}
          </span>
        </div>

        {/* Subtle status badges for admin */}
        {(product.isTopSeller || (product.stock > 0 && product.stock <= 2)) && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {product.isTopSeller && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171B2B] border border-[#D4AF37]/40 text-[#F3E0A9] text-[9px] font-extrabold uppercase tracking-wider">
                MÁS VENDIDO
              </span>
            )}
            {product.stock > 0 && product.stock <= 2 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1E1215] border border-rose-500/30 text-rose-300 text-[9px] font-extrabold uppercase tracking-wider">
                {product.stock === 1 ? 'ÚLTIMA UD' : `ÚLTIMAS ${product.stock} UDS`}
              </span>
            )}
          </div>
        )}

        <h3 className="text-base font-bold text-white leading-snug flex items-start gap-2">
          <Smartphone className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
          <span>{product.modelo}</span>
        </h3>
      </div>

      <div className="mt-4">
        {/* Stock text directly above the fine line of price */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="font-medium text-gray-400">Stock:</span>
          <span className="font-semibold text-gray-200">
            {product.stock <= 0 ? 'Sin stock' : `${product.stock} uds.`}
          </span>
        </div>

        <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
              Precio
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-[#F3E0A9]">
                ${product.precio}
              </span>
              <span className="text-xs font-semibold text-gray-400">USD</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onEdit && (
              <button
                id={`btn-edit-trigger-${product.id}`}
                onClick={() => onEdit(product)}
                className="px-2.5 py-2 rounded-xl bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#E5C158] border border-[#D4AF37]/30 text-xs font-bold flex items-center gap-1.5 transition-all duration-200"
                title="Editar precio y detalles del display"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}

            {/* Delete Trigger */}
            {!showConfirm ? (
              <button
                id={`btn-delete-trigger-${product.id}`}
                onClick={() => setShowConfirm(true)}
                className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all duration-200"
                title="Eliminar de catálogo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  id={`btn-delete-confirm-${product.id}`}
                  onClick={handleDeleteClick}
                  className="px-2 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-md transition-all duration-150 whitespace-nowrap"
                >
                  Sí, Borrar
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
