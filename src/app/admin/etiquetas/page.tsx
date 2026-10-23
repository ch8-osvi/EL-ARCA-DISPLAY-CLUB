'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Filter,
  Info,
  Layers,
  PackagePlus,
  Printer,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import BoxEditor, { StockFilter } from '@/components/labels/BoxEditor';
import LabelPreview from '@/components/labels/LabelPreview';
import LabelSettingsPanel from '@/components/labels/LabelSettingsPanel';
import LabelSheet from '@/components/labels/LabelSheet';
import {
  parseSettings,
  useLabelDraft,
} from '@/components/labels/useLabelDraft';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  BoxLabelDraft,
  boxTotal,
  computeGrid,
  paginate,
  totalsByProduct,
  validateBox,
} from '@/lib/labelLayout';
import { Product } from '@/lib/types';

export default function EtiquetasPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [overflowMap, setOverflowMap] = useState<Record<string, boolean>>({});

  const {
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
  } = useLabelDraft();

  // Verificación de sesión de admin (patrón exacto de /admin/duplicados)
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const triggerToast = (msg: string, ms = 4000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  };

  // Carga de catálogo completa (incluye stock 0 para permitir seleccionar todo)
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    const fetchAllProducts = async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch('/api/products?all=true');
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.products)) {
            setProducts(data.products);
            return;
          }
        }
      } catch (err) {
        console.warn('Fallo al obtener inventario remoto en /admin/etiquetas, usando respaldo local');
      }

      // Respaldo de localStorage si la API estuviese offline
      try {
        const local = localStorage.getItem('el_arca_products');
        if (local && active) {
          setProducts(JSON.parse(local));
        }
      } catch {
        /* sin respaldo disponible */
      } finally {
        if (active) setLoadingProducts(false);
      }
    };

    fetchAllProducts().finally(() => {
      if (active) setLoadingProducts(false);
    });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Mapa rápido de productos por ID
  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  // Si los nombres en la base de datos se normalizaron/actualizaron, refrescar snapshots
  useEffect(() => {
    if (hydrated && productsById.size > 0) {
      refreshSnapshots(productsById);
    }
  }, [hydrated, productsById, refreshSnapshots]);

  const knownProductIds = useMemo(() => {
    if (loadingProducts || products.length === 0) return null;
    return new Set(products.map((p) => p.id));
  }, [loadingProducts, products]);

  // Cálculo de grilla A4
  const settings = useMemo(() => parseSettings(settingsInput), [settingsInput]);
  const grid = useMemo(() => computeGrid(settings), [settings]);

  // Validación de cada caja
  const boxIssuesList = useMemo(() => {
    return boxes.map((b) => validateBox(b, knownProductIds));
  }, [boxes, knownProductIds]);

  const hasGlobalErrors = useMemo(() => {
    return boxIssuesList.some(
      (issue) => issue.errors.length > 0 || Object.keys(issue.lineErrors).length > 0
    );
  }, [boxIssuesList]);

  // Totales acumulados por producto
  const totalsAcrossBoxes = useMemo(() => totalsByProduct(boxes), [boxes]);

  const totalBoxesCount = boxes.length;
  const totalPiecesCount = useMemo(() => {
    return boxes.reduce((acc, b) => acc + boxTotal(b), 0);
  }, [boxes]);

  // Paginación para imprimir y vista previa
  const pages = useMemo(() => {
    if (!grid.ok || grid.perPage <= 0) return [];
    return paginate(boxes, grid.perPage);
  }, [boxes, grid]);

  // Callback de desbordamiento de texto detectado en BoxLabel
  const handleOverflowChange = (boxUid: string, overflow: boolean) => {
    setOverflowMap((prev) => {
      if (prev[boxUid] === overflow) return prev;
      return { ...prev, [boxUid]: overflow };
    });
  };

  // Wrapper para añadir línea con aviso si sumó cantidad
  const handleAddLine = (boxUid: string, product: Product, qty: number) => {
    const targetBox = boxes.find((b) => b.uid === boxUid);
    const existing = targetBox?.lines.some((l) => l.productId === product.id);
    addLine(boxUid, product, qty);
    if (existing) {
      triggerToast(`Se sumaron +${qty} unidades a la línea existente.`);
    }
  };

  // Manejo de impresión
  const handlePrint = () => {
    if (!grid.ok) {
      triggerToast('No se puede imprimir: la configuración de etiqueta no es válida.');
      return;
    }
    if (boxes.length === 0 || hasGlobalErrors) {
      setShowValidationErrors(true);
      triggerToast('Corrige los errores antes de imprimir.');
      return;
    }
    window.print();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-[#D4AF37]/30 shadow-2xl text-center space-y-5">
          <ShieldAlert className="w-12 h-12 text-[#D4AF37] mx-auto animate-bounce" />
          <h1 className="text-xl font-extrabold text-white">Acceso Restringido</h1>
          <p className="text-xs text-gray-400">
            Debes iniciar sesión en el Panel Administrativo para usar el etiquetador.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center w-full py-3 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Ir al Acceso Administrativo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 1. INTERFAZ EN PANTALLA (se oculta automáticamente en @media print) */}
      <div className="labels-screen min-h-screen bg-[#090A0F] text-white flex flex-col">
        <Navbar isAdmin={true} onLogout={() => {}} totalProducts={products.length} />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Barra de Navegación y Título */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#D4AF37] font-semibold transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" /> Volver al Panel Admin
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#E5C158]">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
                    ETIQUETADOR
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#10131E] border border-white/10 text-gray-400">
                      Cajas Físicas
                    </span>
                  </h1>
                  <p className="text-xs text-gray-400">
                    Crea, configura y previsualiza etiquetas para impresión en hoja A4.
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones principales: Imprimir y Limpiar */}
            <div className="flex items-center gap-3 self-end md:self-auto">
              <button
                id="btn-labels-clear-all"
                type="button"
                onClick={() => {
                  if (confirm('¿Deseas reiniciar todas las etiquetas? Se borrarán las cajas actuales.')) {
                    clearAll();
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar
              </button>

              <button
                id="btn-labels-print-main"
                type="button"
                onClick={handlePrint}
                className="px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir / PDF
              </button>
            </div>
          </div>

          {/* Banner informativo de instrucciones de escala de impresión */}
          <div className="glass-panel rounded-2xl p-4 border border-blue-500/30 bg-blue-500/10 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200/90 leading-relaxed">
              <strong>Tip de impresión exacta:</strong> En la ventana de impresión del navegador, asegúrate de
              seleccionar <strong>Escala: 100%</strong> (o Por defecto) y <strong>Márgenes: Ninguno</strong> para
              que las etiquetas conserven exactamente los centímetros configurados.
            </div>
          </div>

          {/* Configuración de medidas físicas A4 */}
          <LabelSettingsPanel
            value={settingsInput}
            onChange={setSettingsInput}
            onReset={resetSettings}
            grid={grid}
          />

          {/* Barra de Filtro de Stock y Resumen */}
          <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-xs font-semibold text-gray-300">Mostrar en el buscador:</span>
              <div className="inline-flex rounded-xl p-1 bg-[#10131E] border border-white/10">
                <button
                  type="button"
                  onClick={() => setStockFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    stockFilter === 'all'
                      ? 'gold-gradient-bg text-black shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Todos los productos ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('stock')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    stockFilter === 'stock'
                      ? 'gold-gradient-bg text-black shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Solo con Stock ({products.filter((p) => (p.stock ?? 0) > 0).length})
                </button>
              </div>
            </div>

            {/* Contador total */}
            <div className="text-xs text-gray-400 flex items-center gap-3">
              <span>
                Cajas: <strong className="text-white">{totalBoxesCount}</strong>
              </span>
              <span>•</span>
              <span>
                Piezas totales: <strong className="text-[#E5C158]">{totalPiecesCount}</strong>
              </span>
              <span>•</span>
              <span>
                Hojas A4 estimadas: <strong className="text-white">{pages.length}</strong>
              </span>
            </div>
          </div>

          {/* Grid Principal: Columna izquierda (Editor) vs Columna derecha (Vista Previa en Vivo) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* COLUMNA IZQUIERDA: Listado de Cajas */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <PackagePlus className="w-4 h-4 text-[#D4AF37]" /> Cajas a Identificar
                </h2>
                <button
                  id="btn-labels-add-box"
                  type="button"
                  onClick={() => {
                    const newUid = addBox();
                    setTimeout(() => {
                      document.getElementById(`label-box-${newUid}`)?.scrollIntoView({ behavior: 'smooth' });
                    }, 50);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-[#E5C158] border border-[#D4AF37]/40 font-bold text-xs flex items-center gap-1.5 transition-all"
                >
                  <PackagePlus className="w-4 h-4" />
                  Nueva Caja
                </button>
              </div>

              {boxes.map((box, idx) => (
                <BoxEditor
                  key={box.uid}
                  box={box}
                  index={idx + 1}
                  products={products}
                  productsById={productsById}
                  stockFilter={stockFilter}
                  issues={boxIssuesList[idx] || { errors: [], lineErrors: {} }}
                  showErrors={showValidationErrors}
                  overflow={Boolean(overflowMap[box.uid])}
                  totalsAcrossBoxes={totalsAcrossBoxes}
                  onAddLine={handleAddLine}
                  onLineQtyChange={setLineQty}
                  onRemoveLine={removeLine}
                  onNoteChange={setNote}
                  onDuplicate={duplicateBox}
                  onRemove={removeBox}
                />
              ))}

              <button
                id="btn-labels-add-box-bottom"
                type="button"
                onClick={() => addBox()}
                className="w-full py-3.5 rounded-2xl border border-dashed border-white/20 hover:border-[#D4AF37]/60 text-gray-400 hover:text-[#E5C158] font-bold text-xs flex items-center justify-center gap-2 transition-all hover:bg-white/5"
              >
                <PackagePlus className="w-4 h-4" />
                Agregar otra caja
              </button>
            </div>

            {/* COLUMNA DERECHA: Vista Previa en Tiempo Real de Hoja A4 */}
            <div className="lg:col-span-5 sticky top-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#D4AF37]" /> Vista Previa A4
                </h2>
                <span className="text-[11px] text-gray-400">
                  {grid.ok ? `${grid.perPage} etiquetas por página` : 'Error de medidas'}
                </span>
              </div>

              <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 max-h-[80vh] overflow-y-auto">
                <LabelPreview
                  boxes={boxes}
                  grid={grid}
                  onOverflowChange={handleOverflowChange}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* 2. ÁREA DE IMPRESIÓN EXCLUSIVA (se activa solo al llamar window.print()) */}
      {grid.ok && (
        <div className="labels-print-area" aria-hidden="true">
          {pages.map((pageBoxes, pi) => (
            <LabelSheet
              key={`print-page-${pi}`}
              boxes={pageBoxes}
              startIndex={pi * grid.perPage}
              grid={grid}
              showEmptySlots={false}
            />
          ))}
        </div>
      )}

      {/* Toast Notificación */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] glass-panel px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-[#D4AF37]/40 bg-[#121522] text-white animate-fade-in shadow-gold-glow">
          <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}
    </>
  );
}
