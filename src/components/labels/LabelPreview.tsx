'use client';

import React, { useEffect, useRef, useState } from 'react';
import LabelSheet from './LabelSheet';
import { A4_HEIGHT_MM, A4_WIDTH_MM, BoxLabelDraft, GridLayout, paginate } from '@/lib/labelLayout';

const MM_TO_PX = 96 / 25.4;

interface LabelPreviewProps {
  boxes: BoxLabelDraft[];
  grid: GridLayout;
  onOverflowChange: (boxUid: string, overflow: boolean) => void;
}

/**
 * Vista previa: renderiza las MISMAS hojas que se imprimen (LabelSheet en mm)
 * y solo las escala visualmente con transform para que quepan en pantalla.
 */
export default function LabelPreview({ boxes, grid, onOverflowChange }: LabelPreviewProps) {
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

  const pages = grid.ok ? paginate(boxes, grid.perPage) : [];
  const sheetW = A4_WIDTH_MM * MM_TO_PX * scale;
  const sheetH = A4_HEIGHT_MM * MM_TO_PX * scale;

  return (
    <div ref={containerRef} className="w-full space-y-5">
      {pages.length === 0 && grid.ok && (
        <div
          className="mx-auto rounded-md bg-white/95 flex items-center justify-center text-gray-500 text-xs"
          style={{ width: sheetW, height: sheetH }}
        >
          Añade una caja para ver la hoja A4
        </div>
      )}
      {pages.map((pageBoxes, pi) => (
        <div key={pi}>
          <p className="text-[11px] text-gray-400 mb-1.5 font-semibold">
            Hoja {pi + 1} de {pages.length} · {pageBoxes.length}/{grid.perPage} etiquetas
          </p>
          <div
            className="relative rounded-sm shadow-2xl shadow-black/60 ring-1 ring-white/10 overflow-hidden"
            style={{ width: sheetW, height: sheetH }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <LabelSheet
                boxes={pageBoxes}
                startIndex={pi * grid.perPage}
                grid={grid}
                showEmptySlots
                onOverflowChange={onOverflowChange}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
