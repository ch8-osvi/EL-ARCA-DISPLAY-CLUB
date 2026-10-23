'use client';

import React from 'react';
import { AlertTriangle, RotateCcw, Ruler } from 'lucide-react';
import { GridLayout, MAX_GAP_MM, MAX_MARGIN_MM, MIN_GAP_MM, MIN_MARGIN_MM } from '@/lib/labelLayout';
import { SettingsInput } from './useLabelDraft';

interface Props {
  value: SettingsInput;
  onChange: (v: SettingsInput) => void;
  onReset: () => void;
  grid: GridLayout;
}

const PRESETS: { w: number; h: number }[] = [
  { w: 8, h: 8 },
  { w: 6, h: 6 },
  { w: 10, h: 5 },
  { w: 10, h: 10 },
];

const FIELDS: { key: keyof SettingsInput; label: string; unit: string; step: string; min: number; max?: number }[] = [
  { key: 'widthCm', label: 'Ancho', unit: 'cm', step: '0.1', min: 3, max: 20 },
  { key: 'heightCm', label: 'Alto', unit: 'cm', step: '0.1', min: 3, max: 28 },
  { key: 'marginMm', label: 'Margen hoja', unit: 'mm', step: '1', min: MIN_MARGIN_MM, max: MAX_MARGIN_MM },
  { key: 'gapMm', label: 'Separación', unit: 'mm', step: '1', min: MIN_GAP_MM, max: MAX_GAP_MM },
];

export default function LabelSettingsPanel({ value, onChange, onReset, grid }: Props) {
  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 space-y-4" aria-labelledby="label-settings-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="label-settings-title" className="text-sm font-bold text-white flex items-center gap-2">
          <Ruler className="w-4 h-4 text-[#D4AF37]" /> Tamaño de etiqueta (A4)
        </h2>
        <button
          id="btn-labels-reset-settings"
          type="button"
          onClick={onReset}
          className="text-[11px] text-gray-400 hover:text-[#E5C158] flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restablecer
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = Number(value.widthCm) === p.w && Number(value.heightCm) === p.h;
          return (
            <button
              key={`${p.w}x${p.h}`}
              type="button"
              onClick={() => onChange({ ...value, widthCm: String(p.w), heightCm: String(p.h) })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                active
                  ? 'gold-gradient-bg text-black border-transparent'
                  : 'bg-white/5 text-gray-300 border-white/10 hover:border-[#D4AF37]/50'
              }`}
            >
              {p.w} × {p.h} cm
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-[11px] font-semibold text-gray-400">
              {f.label} ({f.unit})
            </span>
            <input
              id={`input-label-${f.key}`}
              type="number"
              inputMode="decimal"
              step={f.step}
              min={f.min}
              max={f.max}
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              className="w-full px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
            />
          </label>
        ))}
      </div>

      {grid.ok ? (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
          Caben <strong>{grid.cols}</strong> por fila × <strong>{grid.rows}</strong> filas ={' '}
          <strong>{grid.perPage} etiquetas por hoja</strong> de {grid.labelWidthMm / 10} × {grid.labelHeightMm / 10} cm.
        </p>
      ) : (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {grid.error}
        </p>
      )}
    </section>
  );
}
