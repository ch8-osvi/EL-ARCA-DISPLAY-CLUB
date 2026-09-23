'use client';

import React, { useMemo } from 'react';
import { Product, Currency } from '@/lib/types';
import { Smartphone, MessageSquare, Tag, Search, TrendingUp, AlertCircle, Sparkles } from 'lucide-react';
import { roundCupPrice } from '@/lib/searchUtils';

interface ProductCardProps {
  product: Product;
  currency?: Currency;
  exchangeRate?: number;
}

export default function ProductCard({
  product,
  currency = 'USD',
  exchangeRate = 300,
}: ProductCardProps) {
  const getQualityBadgeClass = (calidad: string) => {
    const q = calidad.toUpperCase();
    if (q.includes('C/M') || q.includes('MARCO')) return 'badge-cm';
    if (q.includes('ORIGINAL')) return 'badge-original';
    if (q.includes('INCELL')) return 'badge-incell';
    if (q.includes('OLED')) return 'badge-oled';
    return 'badge-other';
  };

  // Cuban Peso calculation (strictly rounded to nearest multiple of 100)
  const cupPrice = useMemo(() => {
    return roundCupPrice(product.precio, exchangeRate);
  }, [product.precio, exchangeRate]);

  // Dynamic Badges without emojis
  const isTopSeller = Boolean(product.isTopSeller);
  const isLowStock = product.stock > 0 && product.stock <= 2;
  const isNewArrival = useMemo(() => {
    if (!product.createdAt) return false;
    const createdTime = new Date(product.createdAt).getTime();
    if (isNaN(createdTime)) return false;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    return Date.now() - createdTime <= fourteenDaysMs;
  }, [product.createdAt]);

  // WhatsApp link configuration
  const whatsappNumber = '5352031972';
  const formattedCUP = cupPrice.toLocaleString('es-CU');
  const whatsappText = encodeURIComponent(
    `Hola! Deseo consultar la disponibilidad del display: ${product.marca} ${product.modelo} (${product.calidad}) - $${product.precio} USD (${formattedCUP} CUP) en EL ARCA DISPLAY CLUB.`
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappText}`;

  // Google Images Search Link (Lupa)
  const googleSearchQuery = encodeURIComponent(
    `display ${product.marca} ${product.modelo} ${product.calidad}`
  );
  const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${googleSearchQuery}`;

  return (
    <div className="group glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-300">
      {/* Top ambient gold accent line on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37]/0 to-transparent group-hover:via-[#D4AF37] transition-all duration-500"></div>

      <div>
        {/* Header: Brand & Quality + Google Search Lupa Button */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="px-2.5 py-1 rounded-lg bg-[#171B2B] border border-white/10 text-[11px] font-bold tracking-wide text-[#E5C158] uppercase flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-[#D4AF37]" />
            {product.marca}
          </span>

          <div className="flex items-center gap-1.5">
            <span className={`badge-quality ${getQualityBadgeClass(product.calidad)}`}>
              {product.calidad}
            </span>

            {/* Google Search Lupa Button */}
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-[#171B2B] hover:bg-[#22273D] border border-[#D4AF37]/30 text-[#D4AF37] hover:text-white transition-all duration-200"
              title="Ver fotos de este display en Google Imagenes"
            >
              <Search className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Dynamic High-Impact Badges (Minimalist, Professional, No Emojis) */}
        {(isTopSeller || isLowStock || isNewArrival) && (
          <div className="flex items-center flex-wrap gap-1.5 mb-2.5">
            {isTopSeller && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#171B2B] border border-[#D4AF37]/40 text-[#F3E0A9] text-[10px] font-extrabold tracking-wider uppercase shadow-sm">
                <TrendingUp className="w-3 h-3 text-[#D4AF37]" />
                <span>MÁS VENDIDO</span>
              </span>
            )}
            {isLowStock && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1E1215] border border-rose-500/30 text-rose-300 text-[10px] font-extrabold tracking-wider uppercase">
                <AlertCircle className="w-3 h-3 text-rose-400" />
                <span>{product.stock === 1 ? 'ÚLTIMA UNIDAD' : `ÚLTIMAS ${product.stock} UDS`}</span>
              </span>
            )}
            {isNewArrival && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#101926] border border-cyan-500/30 text-cyan-300 text-[10px] font-extrabold tracking-wider uppercase">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>NUEVO INGRESO</span>
              </span>
            )}
          </div>
        )}

        {/* Model Title */}
        <h3 className="text-base font-bold text-white group-hover:text-[#F3E0A9] transition-colors leading-snug mb-3 flex items-start gap-2">
          <Smartphone className="w-4 h-4 text-gray-400 mt-1 shrink-0 group-hover:text-[#D4AF37] transition-colors" />
          <span>{product.modelo}</span>
        </h3>
      </div>

      {/* Footer: Price & WhatsApp Action */}
      <div className="pt-3.5 mt-2 border-t border-white/5 flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase font-semibold text-gray-400 block tracking-wider">
            {currency === 'CUP' ? 'Precio CUP' : 'Precio USD'}
          </span>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-extrabold gold-gradient-text">
                {currency === 'CUP' ? formattedCUP : `$${product.precio}`}
              </span>
              <span className="text-xs font-semibold text-gray-400">
                {currency}
              </span>
            </div>
            {/* Secondary equivalent indicator */}
            <span className="text-[10px] text-gray-400 font-medium">
              {currency === 'CUP'
                ? `≈ $${product.precio} USD`
                : `≈ ${formattedCUP} CUP`}
            </span>
          </div>
        </div>

        {/* Actions: WhatsApp */}
        <div className="flex items-center gap-1.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 hover:shadow-emerald-700/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            title="Consultar disponibilidad por WhatsApp (+53 52031972)"
          >
            <MessageSquare className="w-4 h-4 text-emerald-100" />
            <span>Consultar</span>
          </a>
        </div>
      </div>
    </div>
  );
}

