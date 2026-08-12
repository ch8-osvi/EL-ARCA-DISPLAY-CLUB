'use client';

import React from 'react';
import { Product } from '@/lib/types';
import { MessageSquare, Tag, Smartphone, Search } from 'lucide-react';

interface ProductTableProps {
  products: Product[];
}

export default function ProductTable({ products }: ProductTableProps) {
  const whatsappNumber = '5352031972';

  const getQualityBadgeClass = (calidad: string) => {
    const q = calidad.toUpperCase();
    if (q.includes('C/M') || q.includes('MARCO')) return 'badge-cm';
    if (q.includes('ORIGINAL')) return 'badge-original';
    if (q.includes('INCELL')) return 'badge-incell';
    if (q.includes('OLED')) return 'badge-oled';
    return 'badge-other';
  };

  return (
    <div className="w-full glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-[#10131E] border-b border-[#D4AF37]/20 text-[#E5C158] text-xs uppercase tracking-wider">
              <th className="py-4 px-6 font-bold">Marca</th>
              <th className="py-4 px-6 font-bold">Modelo Display</th>
              <th className="py-4 px-6 font-bold">Calidad</th>
              <th className="py-4 px-6 font-bold text-right">Precio USD</th>
              <th className="py-4 px-6 font-bold text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-gray-200">
            {products.map((product) => {
              const whatsappText = encodeURIComponent(
                `Hola! Deseo consultar la disponibilidad del display: ${product.marca} ${product.modelo} (${product.calidad}) - $${product.precio} USD en EL ARCA DISPLAY CLUB.`
              );
              const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappText}`;

              const googleSearchQuery = encodeURIComponent(
                `display ${product.marca} ${product.modelo} ${product.calidad}`
              );
              const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${googleSearchQuery}`;

              return (
                <tr
                  key={product.id}
                  className="hover:bg-[#171B2B]/70 transition-colors duration-150 group"
                >
                  {/* Marca */}
                  <td className="py-3.5 px-6 font-semibold whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#171B2B] border border-white/10 text-xs font-bold text-[#E5C158]">
                      <Tag className="w-3 h-3 text-[#D4AF37]" />
                      {product.marca}
                    </span>
                  </td>

                  {/* Modelo */}
                  <td className="py-3.5 px-6 font-medium text-white group-hover:text-[#F3E0A9] transition-colors">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{product.modelo}</span>
                    </div>
                  </td>

                  {/* Calidad */}
                  <td className="py-3.5 px-6 whitespace-nowrap">
                    <span className={`badge-quality ${getQualityBadgeClass(product.calidad)}`}>
                      {product.calidad}
                    </span>
                  </td>

                  {/* Precio */}
                  <td className="py-3.5 px-6 font-bold text-right whitespace-nowrap">
                    <span className="text-base gold-gradient-text">
                      ${product.precio}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">USD</span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-6 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <a
                        href={googleSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-[#171B2B] hover:bg-[#22273D] border border-[#D4AF37]/30 text-[#D4AF37] hover:text-white transition-all duration-200"
                        title="Ver fotos en Google Imágenes"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </a>

                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-bold transition-all duration-200"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Cotizar</span>
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
