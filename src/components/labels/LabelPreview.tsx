'use client';

import React, { useEffect, useRef, useState } from 'react';
import LabelSheet from './LabelSheet';
import { A4_HEIGHT_MM, A4_WIDTH_MM, BoxLabelDraft, GridLayout, paginate } from '@/lib/labelLayout';
import { Product } from '@/lib/types';

const MM_TO_PX = 96 / 25.4;

interface LabelPreviewProps {
  mode?: 'box' | 'single';
  boxes?: BoxLabelDraft[];
  singleProducts?: Product[];
  grid: GridLayout;
  onOverflowChange?: (boxUid: string, overflow: boolean) => void;
}

/**
 * Vista previa: renderiza las MISMAS hojas que se imprimen (LabelSheet en mm)
 * y solo las escala visualmente con transform para que quepan en pantalla.
 */
export default function LabelPreview({
  mode = 'box',
  boxes = [],
  singleProducts = [],
  grid,
  onOverflowChange,
}: LabelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.clientWidth / (A4_WIDTH_MM * MM_TO_PX), 1));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxPages = grid.ok && mode === 'box' ? paginate(boxes, grid.perPage) : [];
  const singlePages = grid.ok && mode === 'single' ? paginate(singleProducts, grid.perPage) : [];
  const pageCount = mode === 'box' ? boxPages.length : singlePages.length;

  const sheetW = A4_WIDTH_MM * MM_TO_PX * scale;
  const sheetH = A4_HEIGHT_MM * MM_TO_PX * scale;

  return (
    <div ref={containerRef} className="w-full space-y-5">
      {pageCount === 0 && grid.ok && (
        <div
          className="mx-auto rounded-md bg-white/95 flex items-center justify-center text-gray-500 text-xs text-center p-4"
          style={{ width: sheetW, height: sheetH }}
        >
          {mode === 'box'
            ? 'Añade una caja para ver la hoja A4'
            : 'Selecciona o añade displays para generar los stickers'}
        </div>
      )}
      {mode === 'box'
        ? boxPages.map((pageBoxes, pi) => (
            <div key={`box-page-${pi}`}>
              <p className="text-[11px] text-gray-400 mb-1.5 font-semibold">
                Hoja {pi + 1} de {boxPages.length} · {pageBoxes.length}/{grid.perPage} etiquetas de caja
              </p>
              <div
                className="relative rounded-sm shadow-2xl shadow-black/60 ring-1 ring-white/10 overflow-hidden"
                style={{ width: sheetW, height: sheetH }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <LabelSheet
                    mode="box"
                    boxes={pageBoxes}
                    startIndex={pi * grid.perPage}
                    grid={grid}
                    showEmptySlots
                    onOverflowChange={onOverflowChange}
                  />
                </div>
              </div>
            </div>
          ))
        : singlePages.map((pageProducts, pi) => (
            <div key={`single-page-${pi}`}>
              <p className="text-[11px] text-gray-400 mb-1.5 font-semibold">
                Hoja {pi + 1} de {singlePages.length} · {pageProducts.length}/{grid.perPage} stickers individuales
              </p>
              <div
                className="relative rounded-sm shadow-2xl shadow-black/60 ring-1 ring-white/10 overflow-hidden"
                style={{ width: sheetW, height: sheetH }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <LabelSheet
                    mode="single"
                    singleProducts={pageProducts}
                    startIndex={pi * grid.perPage}
                    grid={grid}
                    showEmptySlots
                  />
                </div>
              </div>
            </div>
          ))}
    </div>
  );
}
