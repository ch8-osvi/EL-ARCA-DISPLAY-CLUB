'use client';

import React from 'react';
import { Product } from '@/lib/types';
import { productLabel } from '@/lib/labelLayout';

interface SingleStickerLabelProps {
  product: Product;
  widthMm: number;
  heightMm: number;
}

/**
 * Etiqueta Monoproducto / Sticker individual (ej. 4 x 2 cm)
 * Diseñada para bolsita de burbujas:
 * - Nombre del modelo y marca en grande y legible
 * - Calidad destacada en negrita
 * - Micro-cabecera con EL ARCA DISPLAY CLUB
 * - Borde gris fino como guía de corte
 */
export default function SingleStickerLabel({
  product,
  widthMm,
  heightMm,
}: SingleStickerLabelProps) {
  const isSmall = heightMm <= 25;

  return (
    <div
      className="single-sticker-label"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: isSmall ? '1.2mm 2mm' : '2mm 3mm',
        boxSizing: 'border-box',
        border: '0.2mm solid #9CA3AF',
        background: '#FFFFFF',
        color: '#000000',
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        lineHeight: 1.1,
      }}
    >
      {/* Micro Cabecera */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '0.2mm solid #000',
          paddingBottom: '0.4mm',
          marginBottom: '0.5mm',
        }}
      >
        <span
          style={{
            fontSize: isSmall ? '4.5pt' : '5.5pt',
            fontWeight: 800,
            letterSpacing: '0.08em',
          }}
        >
          EL ARCA
        </span>
        <span
          style={{
            fontSize: isSmall ? '4pt' : '5pt',
            fontWeight: 700,
            color: '#374151',
          }}
        >
          DISPLAY CLUB
        </span>
      </div>

      {/* Modelo del Display en Grande */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: isSmall ? '8pt' : '10pt',
            fontWeight: 900,
            letterSpacing: '-0.01em',
            overflowWrap: 'anywhere',
            textTransform: 'uppercase',
            maxHeight: isSmall ? '10mm' : '14mm',
            overflow: 'hidden',
          }}
        >
          {productLabel(product)}
        </div>
      </div>

      {/* Calidad en Bloque Destacado */}
      <div
        style={{
          borderTop: '0.2mm solid #000',
          paddingTop: '0.4mm',
          marginTop: '0.4mm',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: isSmall ? '6pt' : '7.5pt',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            display: 'inline-block',
          }}
        >
          {product.calidad || 'ORIGINAL'}
        </span>
      </div>
    </div>
  );
}
