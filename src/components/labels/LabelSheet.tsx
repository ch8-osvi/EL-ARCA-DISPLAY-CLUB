'use client';

import React from 'react';
import BoxLabel from './BoxLabel';
import SingleStickerLabel from './SingleStickerLabel';
import { A4_HEIGHT_MM, A4_WIDTH_MM, BoxLabelDraft, GridLayout } from '@/lib/labelLayout';
import { Product } from '@/lib/types';

interface LabelSheetProps {
  mode?: 'box' | 'single';
  boxes?: BoxLabelDraft[];
  singleProducts?: Product[];
  /** Índice (0-based) del primer elemento de esta hoja */
  startIndex: number;
  grid: GridLayout;
  /** Muestra las celdas vacías punteadas (solo en vista previa). */
  showEmptySlots?: boolean;
  onOverflowChange?: (boxUid: string, overflow: boolean) => void;
}

/** Hoja A4 real (210 × 297 mm) con la grilla de etiquetas posicionada en mm. */
export default function LabelSheet({
  mode = 'box',
  boxes = [],
  singleProducts = [],
  startIndex,
  grid,
  showEmptySlots = false,
  onOverflowChange,
}: LabelSheetProps) {
  const currentCount = mode === 'box' ? boxes.length : singleProducts.length;
  const emptySlots = showEmptySlots ? Math.max(grid.perPage - currentCount, 0) : 0;

  return (
    <div
      className="label-sheet"
      style={{
        width: `${A4_WIDTH_MM}mm`,
        height: `${A4_HEIGHT_MM}mm`,
        background: '#FFFFFF',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${grid.offsetXMm}mm`,
          top: `${grid.offsetYMm}mm`,
          display: 'grid',
          gridTemplateColumns: `repeat(${grid.cols}, ${grid.labelWidthMm}mm)`,
          gridAutoRows: `${grid.labelHeightMm}mm`,
          gap: `${grid.gapMm}mm`,
        }}
      >
        {mode === 'box'
          ? boxes.map((box, i) => (
              <BoxLabel
                key={box.uid}
                box={box}
                index={startIndex + i + 1}
                widthMm={grid.labelWidthMm}
                heightMm={grid.labelHeightMm}
                onOverflowChange={onOverflowChange}
              />
            ))
          : singleProducts.map((p, i) => (
              <SingleStickerLabel
                key={`single-${p.id}-${startIndex + i}`}
                product={p}
                widthMm={grid.labelWidthMm}
                heightMm={grid.labelHeightMm}
              />
            ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            aria-hidden="true"
            style={{
              width: `${grid.labelWidthMm}mm`,
              height: `${grid.labelHeightMm}mm`,
              border: '0.3mm dashed #D1D5DB',
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  );
}
