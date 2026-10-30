"use client";

import { useCallback, useEffect, useState } from "react";
import { Product } from "@/lib/types";
import {
  addOrMergeLine,
  BoxLabelDraft,
  createUid,
  DEFAULT_SETTINGS,
  LabelDraft,
  LabelSettings,
  isLabelDraft,
} from "@/lib/labelLayout";

/** Borrador local del navegador. NO se guarda en MongoDB ni toca el stock. */
const STORAGE_KEY = "el_arca_labels_draft_v1";

export type SettingsInput = Record<keyof LabelSettings, string>;

const toInput = (s: LabelSettings): SettingsInput => ({
  widthCm: String(s.widthCm),
  heightCm: String(s.heightCm),
  marginMm: String(s.marginMm),
  gapMm: String(s.gapMm),
});

const num = (v: string) =>
  typeof v !== "string" || v.trim() === "" ? NaN : Number(v.replace(",", "."));

export const parseSettings = (i: SettingsInput): LabelSettings => ({
  widthCm: num(i.widthCm),
  heightCm: num(i.heightCm),
  marginMm: num(i.marginMm),
  gapMm: num(i.gapMm),
});

const newBox = (): BoxLabelDraft => ({ uid: createUid(), note: "", lines: [] });

export function useLabelDraft() {
  const [boxes, setBoxes] = useState<BoxLabelDraft[]>([newBox()]);
  const [settingsInput, setSettingsInput] = useState<SettingsInput>(
    toInput(DEFAULT_SETTINGS),
  );
  const [hydrated, setHydrated] = useState(false);

  // Cargar borrador
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as LabelDraft;
        if (isLabelDraft(d)) {
          setBoxes(d.boxes.length ? d.boxes : [newBox()]);
          if (d.settings)
            setSettingsInput(toInput({ ...DEFAULT_SETTINGS, ...d.settings }));
        }
      }
    } catch {
      /* borrador corrupto: se ignora */
    }
    setHydrated(true);
  }, []);

  // Guardar borrador
  useEffect(() => {
    if (!hydrated) return;
    const s = parseSettings(settingsInput);
    const safe: LabelSettings = {
      widthCm: Number.isFinite(s.widthCm)
        ? s.widthCm
        : DEFAULT_SETTINGS.widthCm,
      heightCm: Number.isFinite(s.heightCm)
        ? s.heightCm
        : DEFAULT_SETTINGS.heightCm,
      marginMm: Number.isFinite(s.marginMm)
        ? s.marginMm
        : DEFAULT_SETTINGS.marginMm,
      gapMm: Number.isFinite(s.gapMm) ? s.gapMm : DEFAULT_SETTINGS.gapMm,
    };
    const draft: LabelDraft = { version: 1, settings: safe, boxes };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [boxes, settingsInput, hydrated]);

  const updateBox = useCallback(
    (uid: string, fn: (b: BoxLabelDraft) => BoxLabelDraft) => {
      setBoxes((prev) => prev.map((b) => (b.uid === uid ? fn(b) : b)));
    },
    [],
  );

  /** Añade un producto; si ya existe en la caja, suma la cantidad a esa línea. */
  const addLine = useCallback(
    (boxUid: string, p: Product, qty: number) =>
      updateBox(boxUid, (b) => ({
        ...b,
        lines: addOrMergeLine(
          b.lines,
          p.id,
          { marca: p.marca, modelo: p.modelo, calidad: p.calidad },
          qty,
        ).lines,
      })),
    [updateBox],
  );

  const setLineQty = useCallback(
    (boxUid: string, lineUid: string, qty: string) =>
      updateBox(boxUid, (b) => ({
        ...b,
        lines: b.lines.map((l) => (l.uid === lineUid ? { ...l, qty } : l)),
      })),
    [updateBox],
  );

  const removeLine = useCallback(
    (boxUid: string, lineUid: string) =>
      updateBox(boxUid, (b) => ({
        ...b,
        lines: b.lines.filter((l) => l.uid !== lineUid),
      })),
    [updateBox],
  );

  const setNote = useCallback(
    (boxUid: string, note: string) =>
      updateBox(boxUid, (b) => ({ ...b, note })),
    [updateBox],
  );

  const addBox = useCallback(() => {
    const b = newBox();
    setBoxes((prev) => [...prev, b]);
    return b.uid;
  }, []);

  const duplicateBox = useCallback((uid: string) => {
    setBoxes((prev) => {
      const i = prev.findIndex((b) => b.uid === uid);
      if (i === -1) return prev;
      const src = prev[i];
      const copy: BoxLabelDraft = {
        uid: createUid(),
        note: src.note,
        lines: src.lines.map((l) => ({ ...l, uid: createUid() })),
      };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }, []);

  const removeBox = useCallback((uid: string) => {
    setBoxes((prev) => prev.filter((b) => b.uid !== uid));
  }, []);

  const clearAll = useCallback(() => setBoxes([newBox()]), []);

  const resetSettings = useCallback(
    () => setSettingsInput(toInput(DEFAULT_SETTINGS)),
    [],
  );

  /** Actualiza nombres guardados con los datos actuales del inventario (sin tocar cantidades). */
  const refreshSnapshots = useCallback((byId: Map<string, Product>) => {
    setBoxes((prev) =>
      prev.map((b) => ({
        ...b,
        lines: b.lines.map((l) => {
          const p = byId.get(l.productId);
          return p
            ? {
                ...l,
                snapshot: {
                  marca: p.marca,
                  modelo: p.modelo,
                  calidad: p.calidad,
                },
              }
            : l;
        }),
      })),
    );
  }, []);

  return {
    boxes,
    hydrated,
    settingsInput,
    setSettingsInput,
    resetSettings,
    addLine,
    setLineQty,
    removeLine,
    setNote,
    addBox,
    duplicateBox,
    removeBox,
    clearAll,
    refreshSnapshots,
  };
}
