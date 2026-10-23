'use client';

import React, { useLayoutEffect, useRef } from 'react';
import {
  BoxLabelDraft,
  boxTotal,
  computeTypography,
  parseQty,
  productLabel,
} from '@/lib/labelLayout';

interface BoxLabelProps {
  box: BoxLabelDraft;
  /** Número visible de la caja (1, 2, 3…). */
  index: number;
  widthMm: number;
  heightMm: number;
  /** Se llama cuando cambia el estado de desbordamiento (solo en vista previa). */
  onOverflowChange?: (boxUid: string, overflow: boolean) => void;
}

/**
 * Etiqueta física de una caja. Todas las medidas en mm/pt para que la vista
 * previa y la impresión usen exactamente la misma composición.
 * Impresión en negro sobre blanco; borde gris fino = guía de corte.
 */
export default function BoxLabel({ box, index, widthMm, heightMm, onOverflowChange }: BoxLabelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const note = box.note.trim();
  const t = computeTypography(widthMm, heightMm, box.lines.length, note.length > 0);
  const total = boxTotal(box);

  useLayoutEffect(() => {
    if (!onOverflowChange || !bodyRef.current) return;
    const el = bodyRef.current;
    // scrollHeight no se ve afectado por transform: scale de la vista previa.
    onOverflowChange(box.uid, el.scrollHeight > el.clientHeight + 1);
  });

  return (
    <div
      className="box-label"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        padding: `${t.paddingMm}mm`,
        boxSizing: 'border-box',
        border: '0.2mm solid #9CA3AF',
        background: '#FFFFFF',
        color: '#000000',
        fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        lineHeight: 1.15,
      }}
    >
      {/* Cabecera */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: `${t.brandPt}pt`, letterSpacing: '0.12em', fontWeight: 700 }}>
          EL ARCA DISPLAY CLUB
        </div>
        <div style={{ fontSize: `${t.boxPt}pt`, fontWeight: 800, letterSpacing: '0.02em' }}>
          CAJA {index}
        </div>
        {note && (
          <div
            style={{
              fontSize: `${t.notePt}pt`,
              fontWeight: 600,
              marginTop: '0.4mm',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {note}
          </div>
        )}
        <div style={{ borderBottom: '0.35mm solid #000', marginTop: '1mm' }} />
      </div>

      {/* Líneas: modelo + calidad + cantidad */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: '0.8mm' }}>
        {box.lines.map((line, i) => {
          const q = parseQty(line.qty);
          return (
            <div
              key={line.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.5mm',
                padding: '0.4mm 0',
                borderTop: i === 0 ? 'none' : '0.15mm dashed #6B7280',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: `${t.linePt}pt`,
                    fontWeight: 700,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {productLabel(line.snapshot) || '—'}
                </div>
                {line.snapshot.calidad && (
                  <div style={{ fontSize: `${t.qualityPt}pt`, fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {line.snapshot.calidad}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: `${t.qtyPt}pt`,
                  fontWeight: 800,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                × {q ?? '?'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pie: total */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '0.35mm solid #000',
          paddingTop: '1mm',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: `${t.totalPt}pt`,
          fontWeight: 800,
        }}
      >
        <span>TOTAL</span>
        <span>
          {total} {total === 1 ? 'pieza' : 'piezas'}
        </span>
      </div>
    </div>
  );
}
