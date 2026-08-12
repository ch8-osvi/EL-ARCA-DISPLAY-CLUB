'use client';

import React from 'react';
import { Product } from '@/lib/types';
import { Smartphone, MessageSquare, Tag, Search } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const getQualityBadgeClass = (calidad: string) => {
    const q = calidad.toUpperCase();
    if (q.includes('C/M') || q.includes('MARCO')) return 'badge-cm';
    if (q.includes('ORIGINAL')) return 'badge-original';
    if (q.includes('INCELL')) return 'badge-incell';
    if (q.includes('OLED')) return 'badge-oled';
    return 'badge-other';
  };

  // WhatsApp link configuration
  const whatsappNumber = '5352031972';
  const whatsappText = encodeURIComponent(
    `Hola! Deseo consultar la disponibilidad del display: ${product.marca} ${product.modelo} (${product.calidad}) - $${product.precio} USD en EL ARCA DISPLAY CLUB.`
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
        <div className="flex items-center justify-between gap-2 mb-3">
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
            Precio Lista
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-extrabold gold-gradient-text">
              ${product.precio}
            </span>
            <span className="text-xs font-semibold text-gray-400">USD</span>
          </div>
        </div>

        {/* Actions: WhatsApp & Google Lupa */}
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
