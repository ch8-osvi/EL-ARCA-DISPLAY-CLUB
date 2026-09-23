'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  GitMerge,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Sparkles,
  Smartphone,
  Tag,
  DollarSign,
  Package,
  History,
  X,
  RefreshCw,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { Product } from '@/lib/types';
import { detectDuplicates, DuplicatePair } from '@/lib/duplicateDetector';
import { fuzzyMatchProduct } from '@/lib/searchUtils';

export default function DuplicadosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [ignoredPairs, setIgnoredPairs] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mergedCount, setMergedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'manual'>('suggestions');

  // Manual Merge state
  const [manualProdA, setManualProdA] = useState<Product | null>(null);
  const [manualProdB, setManualProdB] = useState<Product | null>(null);
  const [manualSearchA, setManualSearchA] = useState('');
  const [manualSearchB, setManualSearchB] = useState('');

  // Merge Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<{
    prodA: Product;
    prodB: Product;
  } | null>(null);
  const [primaryTarget, setPrimaryTarget] = useState<'A' | 'B'>('A');
  const [finalModelo, setFinalModelo] = useState('');
  const [finalPrecio, setFinalPrecio] = useState('');
  const [finalCalidad, setFinalCalidad] = useState('');
  const [isSubmittingMerge, setIsSubmittingMerge] = useState(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Auth verification
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch all active products
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      triggerToast('Error cargando catálogo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
    }
  }, [isAuthenticated]);

  // Detect duplicate pairs using the duplicateDetector engine
  const allDetectedPairs = useMemo(() => {
    if (products.length < 2) return [];
    return detectDuplicates(products, 75);
  }, [products]);

  // Filter pairs by search & ignored status
  const visiblePairs = useMemo(() => {
    return allDetectedPairs.filter((pair) => {
      if (ignoredPairs.has(pair.pairId)) return false;

      if (!searchTerm.trim()) return true;

      const q = searchTerm.toLowerCase();
      const matchBrand = pair.productA.marca.toLowerCase().includes(q);
      const matchModelA = pair.productA.modelo.toLowerCase().includes(q);
      const matchModelB = pair.productB.modelo.toLowerCase().includes(q);

      return matchBrand || matchModelA || matchModelB;
    });
  }, [allDetectedPairs, ignoredPairs, searchTerm]);

  // Ignore a pair for this session
  const handleIgnorePair = (pairId: string) => {
    setIgnoredPairs((prev) => {
      const next = new Set(prev);
      next.add(pairId);
      return next;
    });
    triggerToast('Sugerencia descartada');
  };

  // Open merge modal from detected pair or manual selection
  const handleOpenMerge = (prodA: Product, prodB: Product) => {
    setSelectedPair({ prodA, prodB });
    // Default primary target to A
    setPrimaryTarget('A');
    // Pre-populate with the more descriptive or newer model name
    const defaultModelo =
      prodB.modelo.length > prodA.modelo.length ? prodB.modelo : prodA.modelo;
    setFinalModelo(defaultModelo);
    // Pre-populate price (prefer higher price or prodA)
    const defaultPrice = Math.max(prodA.precio || 0, prodB.precio || 0);
    setFinalPrecio(defaultPrice > 0 ? defaultPrice.toString() : prodA.precio.toString());
    setFinalCalidad(prodA.calidad || prodB.calidad || 'ORIGINAL C/M');
    setIsModalOpen(true);
  };

  // Confirm and execute merge
  const handleExecuteMerge = async () => {
    if (!selectedPair) return;

    const parsedPrice = parseFloat(finalPrecio);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      triggerToast('Ingresa un precio válido');
      return;
    }

    if (!finalModelo.trim()) {
      triggerToast('El nombre del modelo no puede estar vacío');
      return;
    }

    const primaryProd = primaryTarget === 'A' ? selectedPair.prodA : selectedPair.prodB;
    const secondaryProd = primaryTarget === 'A' ? selectedPair.prodB : selectedPair.prodA;

    setIsSubmittingMerge(true);

    try {
      const res = await fetch('/api/products/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: primaryProd.id,
          secondaryId: secondaryProd.id,
          finalModelo: finalModelo.trim().toUpperCase(),
          finalPrecio: parsedPrice,
          finalCalidad: finalCalidad.trim().toUpperCase(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        triggerToast(data.message || 'Productos fusionados con éxito');
        setMergedCount((c) => c + 1);

        // Update local state with the returned catalog
        if (Array.isArray(data.products)) {
          setProducts(data.products);
        } else {
          await fetchProducts();
        }

        // Close modal and reset manual selections if any
        setIsModalOpen(false);
        setSelectedPair(null);
        setManualProdA(null);
        setManualProdB(null);
      } else {
        triggerToast(data.error || 'Error al ejecutar fusión');
      }
    } catch (err) {
      console.error('Error executing merge:', err);
      triggerToast('Error de red al fusionar productos');
    } finally {
      setIsSubmittingMerge(false);
    }
  };

  // Manual search filtered lists
  const manualFilteredA = useMemo(() => {
    if (!manualSearchA.trim()) return [];
    return products
      .map((p) => {
        const { match, score } = fuzzyMatchProduct(p, manualSearchA);
        return match ? { product: p, score } : null;
      })
      .filter((x): x is { product: Product; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.product);
  }, [products, manualSearchA]);

  const manualFilteredB = useMemo(() => {
    if (!manualSearchB.trim()) return [];
    return products
      .filter((p) => !manualProdA || p.id !== manualProdA.id)
      .map((p) => {
        const { match, score } = fuzzyMatchProduct(p, manualSearchB);
        return match ? { product: p, score } : null;
      })
      .filter((x): x is { product: Product; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.product);
  }, [products, manualSearchB, manualProdA]);

  // Auth gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full p-8 rounded-3xl border border-amber-500/30 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <GitMerge className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Acceso Administrativo Requerido</h1>
            <p className="text-sm text-gray-400">
              Debes iniciar sesión en el panel de administración para gestionar y fusionar productos.
            </p>
          </div>
          <Link
            href="/admin"
            className="block w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-extrabold text-sm hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20"
          >
            Ir a Iniciar Sesión en Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-gray-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="glass-panel px-5 py-3.5 rounded-2xl border border-[#D4AF37]/50 shadow-2xl flex items-center gap-3 bg-[#10131E]/95 backdrop-blur-xl">
            <CheckCircle2 className="w-5 h-5 text-[#E5C158] shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-white">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Panel Admin</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300">
              <GitMerge className="w-3.5 h-3.5" />
              Gestión de Duplicados
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171B2B] border border-white/10 text-xs font-bold text-[#E5C158]">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Detección de Repuestos Multi-compatibles
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Limpieza y Fusión de Duplicados
            </h1>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
              Detecta automáticamente repuestos que son el mismo producto pero entraron con nombres o abreviaturas diferentes (ej. A02S / A03S vs A04E Universal). Únelos en 1 solo registro sumando su stock y conservando todo el historial de auditoría.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-4 py-3 rounded-2xl bg-[#10131E] border border-white/10 text-center min-w-[120px]">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Sugerencias
              </span>
              <span className="text-xl font-extrabold text-[#F3E0A9]">
                {allDetectedPairs.length} pares
              </span>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-[#10131E] border border-white/10 text-center min-w-[120px]">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Catálogo Activo
              </span>
              <span className="text-xl font-extrabold text-white">
                {products.length} uds
              </span>
            </div>

            {mergedCount > 0 && (
              <div className="px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center min-w-[120px]">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">
                  Fusionados Hoy
                </span>
                <span className="text-xl font-extrabold text-emerald-300">
                  {mergedCount}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Tab Selector */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
              activeTab === 'suggestions'
                ? 'bg-amber-500/20 text-[#F3E0A9] border border-[#D4AF37]/40 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Sugerencias Automáticas</span>
            <span className="px-2 py-0.5 rounded-md bg-[#10131E] border border-white/10 text-[10px]">
              {visiblePairs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-amber-500/20 text-[#F3E0A9] border border-[#D4AF37]/40 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <GitMerge className="w-4 h-4" />
            <span>Fusión Manual Rápida</span>
          </button>
        </div>

        {/* TAB 1: SUGGESTIONS */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            {/* Search Input for Pairs */}
            <div className="relative w-full max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Search className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por marca o modelo..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {loading ? (
              <div className="py-24 text-center space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-[#D4AF37] mx-auto" />
                <p className="text-xs text-gray-400">Analizando catálogo y compatibilidades...</p>
              </div>
            ) : visiblePairs.length === 0 ? (
              <div className="glass-panel rounded-3xl p-12 text-center border border-white/10 max-w-xl mx-auto space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">
                    {searchTerm ? 'No hay duplicados con ese filtro' : '¡Catálogo 100% Limpio!'}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-400">
                    {searchTerm
                      ? 'Intenta con otro término de búsqueda o revisa la pestaña de Fusión Manual.'
                      : 'No se detectaron repuestos duplicados o multi-compatibles sin unificar en este momento.'}
                  </p>
                </div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300"
                  >
                    Limpiar Filtro
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {visiblePairs.map((pair) => {
                  const combinedStock = (pair.productA.stock || 0) + (pair.productB.stock || 0);
                  return (
                    <div
                      key={pair.pairId}
                      className="glass-card rounded-2xl p-5 border border-white/10 hover:border-[#D4AF37]/50 transition-all duration-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6"
                    >
                      {/* Left: Info & Confidence */}
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg bg-[#171B2B] border border-white/10 text-[11px] font-bold text-[#E5C158] uppercase flex items-center gap-1.5">
                            <Tag className="w-3 h-3 text-[#D4AF37]" />
                            {pair.productA.marca}
                          </span>

                          <span className="px-2 py-0.5 rounded-lg bg-[#10131E] border border-white/10 text-[10px] font-bold text-gray-300 uppercase">
                            {pair.productA.calidad}
                          </span>

                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-extrabold text-amber-300">
                            {pair.score}% Coincidencia
                          </span>
                        </div>

                        {/* Side by side comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Product A */}
                          <div className="p-3.5 rounded-xl bg-[#10131E] border border-white/5 space-y-2">
                            <span className="text-[10px] uppercase font-bold text-gray-500 block">
                              Producto 1 (ID: {pair.productA.id})
                            </span>
                            <p className="text-sm font-bold text-white leading-snug">
                              {pair.productA.modelo}
                            </p>
                            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                              <span className="text-gray-400">Stock: <strong className="text-gray-200">{pair.productA.stock} uds</strong></span>
                              <span className="text-[#F3E0A9] font-bold">${pair.productA.precio} USD</span>
                            </div>
                          </div>

                          {/* Product B */}
                          <div className="p-3.5 rounded-xl bg-[#10131E] border border-white/5 space-y-2">
                            <span className="text-[10px] uppercase font-bold text-gray-500 block">
                              Producto 2 (ID: {pair.productB.id})
                            </span>
                            <p className="text-sm font-bold text-white leading-snug">
                              {pair.productB.modelo}
                            </p>
                            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                              <span className="text-gray-400">Stock: <strong className="text-gray-200">{pair.productB.stock} uds</strong></span>
                              <span className="text-[#F3E0A9] font-bold">${pair.productB.precio} USD</span>
                            </div>
                          </div>
                        </div>

                        {/* Reasons */}
                        {pair.reasons.length > 0 && (
                          <div className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
                            <span className="text-amber-400 font-semibold">Motivo:</span>
                            {pair.reasons.map((r, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-gray-300">
                                • {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-2.5 shrink-0 justify-center">
                        <div className="text-center w-full pb-1 lg:pb-0">
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Stock Unificado</span>
                          <span className="text-base font-extrabold text-emerald-400">
                            {combinedStock} unidades
                          </span>
                        </div>

                        <button
                          onClick={() => handleOpenMerge(pair.productA, pair.productB)}
                          className="w-full sm:w-auto lg:w-44 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 transition-all hover:scale-102"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Revisar y Unir</span>
                        </button>

                        <button
                          onClick={() => handleIgnorePair(pair.pairId)}
                          className="w-full sm:w-auto lg:w-44 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs font-semibold transition-colors"
                        >
                          Ignorar sugerencia
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MANUAL MERGE */}
        {activeTab === 'manual' && (
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Fusión Manual de Cualquier Par de Repuestos</h2>
              <p className="text-xs sm:text-sm text-gray-400">
                Selecciona manualmente dos repuestos de tu catálogo para unificarlos en un solo producto con stock combinado.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Selector A */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#E5C158] uppercase block">
                  1. Seleccionar Producto Principal (Destino)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={manualSearchA}
                    onChange={(e) => setManualSearchA(e.target.value)}
                    placeholder="Buscar primer repuesto..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                {manualProdA ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-amber-300 uppercase block">
                        {manualProdA.marca} • {manualProdA.calidad}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{manualProdA.modelo}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Stock: <strong className="text-white">{manualProdA.stock} uds</strong> • Precio: <strong className="text-[#F3E0A9]">${manualProdA.precio} USD</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => setManualProdA(null)}
                      className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  manualFilteredA.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {manualFilteredA.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setManualProdA(p);
                            setManualSearchA('');
                          }}
                          className="p-3 rounded-xl bg-[#10131E] border border-white/5 hover:border-[#D4AF37]/50 hover:bg-[#171B2B] cursor-pointer transition-all flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="text-[10px] font-bold text-[#D4AF37] uppercase">{p.marca} ({p.calidad})</span>
                            <p className="font-semibold text-white">{p.modelo}</p>
                          </div>
                          <span className="font-bold text-gray-300">{p.stock} uds</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Selector B */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-blue-400 uppercase block">
                  2. Seleccionar Producto a Integrar (Secundario)
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={manualSearchB}
                    onChange={(e) => setManualSearchB(e.target.value)}
                    placeholder="Buscar segundo repuesto..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                {manualProdB ? (
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-blue-300 uppercase block">
                        {manualProdB.marca} • {manualProdB.calidad}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{manualProdB.modelo}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Stock: <strong className="text-white">{manualProdB.stock} uds</strong> • Precio: <strong className="text-[#F3E0A9]">${manualProdB.precio} USD</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => setManualProdB(null)}
                      className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  manualFilteredB.length > 0 && (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {manualFilteredB.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setManualProdB(p);
                            setManualSearchB('');
                          }}
                          className="p-3 rounded-xl bg-[#10131E] border border-white/5 hover:border-blue-500/50 hover:bg-[#171B2B] cursor-pointer transition-all flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="text-[10px] font-bold text-blue-400 uppercase">{p.marca} ({p.calidad})</span>
                            <p className="font-semibold text-white">{p.modelo}</p>
                          </div>
                          <span className="font-bold text-gray-300">{p.stock} uds</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Launch Manual Merge */}
            {manualProdA && manualProdB && (
              <div className="pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-4">
                <div className="text-xs text-gray-300">
                  Total combinado al fusionar: <strong className="text-emerald-400">{(manualProdA.stock || 0) + (manualProdB.stock || 0)} unidades</strong>
                </div>
                <button
                  onClick={() => handleOpenMerge(manualProdA, manualProdB)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>Configurar y Fusionar Estos 2 Repuestos</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MERGE MODAL (Apple Style Side-by-Side Comparison) */}
      {isModalOpen && selectedPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl rounded-3xl border border-[#D4AF37]/50 shadow-2xl bg-[#0D101A] overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Fusión y Unificación de Repuestos
                  </h3>
                  <p className="text-xs text-gray-400">
                    Marca: <strong className="text-[#E5C158]">{selectedPair.prodA.marca}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Product Target Selector */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  1. ¿Cuál es el registro principal que conservará el ID?
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A */}
                  <div
                    onClick={() => {
                      setPrimaryTarget('A');
                      setFinalModelo(selectedPair.prodA.modelo);
                      setFinalPrecio(selectedPair.prodA.precio.toString());
                      setFinalCalidad(selectedPair.prodA.calidad);
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      primaryTarget === 'A'
                        ? 'bg-amber-500/10 border-[#D4AF37] ring-1 ring-[#D4AF37]'
                        : 'bg-[#10131E] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold text-[#E5C158] uppercase">Opción A (ID: {selectedPair.prodA.id})</span>
                      {primaryTarget === 'A' && <Check className="w-4 h-4 text-[#D4AF37]" />}
                    </div>
                    <p className="text-xs font-bold text-white line-clamp-2">{selectedPair.prodA.modelo}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Stock: <strong className="text-gray-200">{selectedPair.prodA.stock} uds</strong></span>
                      <span className="text-[#F3E0A9] font-bold">${selectedPair.prodA.precio} USD</span>
                    </div>
                  </div>

                  {/* Option B */}
                  <div
                    onClick={() => {
                      setPrimaryTarget('B');
                      setFinalModelo(selectedPair.prodB.modelo);
                      setFinalPrecio(selectedPair.prodB.precio.toString());
                      setFinalCalidad(selectedPair.prodB.calidad);
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      primaryTarget === 'B'
                        ? 'bg-amber-500/10 border-[#D4AF37] ring-1 ring-[#D4AF37]'
                        : 'bg-[#10131E] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold text-[#E5C158] uppercase">Opción B (ID: {selectedPair.prodB.id})</span>
                      {primaryTarget === 'B' && <Check className="w-4 h-4 text-[#D4AF37]" />}
                    </div>
                    <p className="text-xs font-bold text-white line-clamp-2">{selectedPair.prodB.modelo}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Stock: <strong className="text-gray-200">{selectedPair.prodB.stock} uds</strong></span>
                      <span className="text-[#F3E0A9] font-bold">${selectedPair.prodB.precio} USD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Name Customizer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    2. Nombre / Modelo Final Unificado
                  </label>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFinalModelo(selectedPair.prodA.modelo)}
                      className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 font-medium"
                    >
                      Usar Nombre A
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinalModelo(selectedPair.prodB.modelo)}
                      className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 font-medium"
                    >
                      Usar Nombre B
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={finalModelo}
                  onChange={(e) => setFinalModelo(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white font-bold text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Price & Quality Customizer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      3. Precio Final (USD)
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setFinalPrecio(selectedPair.prodA.precio.toString())}
                        className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#F3E0A9]"
                      >
                        ${selectedPair.prodA.precio}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinalPrecio(selectedPair.prodB.precio.toString())}
                        className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#F3E0A9]"
                      >
                        ${selectedPair.prodB.precio}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      value={finalPrecio}
                      onChange={(e) => setFinalPrecio(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white font-extrabold text-sm focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                    4. Calidad Unificada
                  </label>
                  <input
                    type="text"
                    value={finalCalidad}
                    onChange={(e) => setFinalCalidad(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white font-bold text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Mathematical Summary Card */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">
                  Resultado Matemático del Inventario
                </span>
                <div className="flex items-center justify-between text-xs sm:text-sm text-gray-200">
                  <span>Stock Actual: <strong>{selectedPair.prodA.stock}</strong> (A) + <strong>{selectedPair.prodB.stock}</strong> (B)</span>
                  <span className="text-emerald-400 font-extrabold text-base">
                    = {(selectedPair.prodA.stock || 0) + (selectedPair.prodB.stock || 0)} unidades
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-snug pt-1 border-t border-white/5">
                  🛡️ <strong>Trazabilidad protegida:</strong> Todo el historial de entradas, salidas y ventas previas de ambos repuestos se conservará unificado. El producto secundario quedará eliminado del catálogo.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 bg-[#0A0D14]/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-semibold text-xs transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmittingMerge}
                onClick={handleExecuteMerge}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {isSubmittingMerge ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Fusionando inventario...</span>
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4" />
                    <span>Confirmar y Fusionar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
