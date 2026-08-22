'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  Search,
  Plus,
  History,
  CheckCircle2,
  Smartphone,
  X,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  AlertOctagon,
  RotateCcw,
} from 'lucide-react';
import { Product } from '@/lib/types';
import {
  getBrandCounts,
  getSortedBrands,
  matchBrandFilter,
  sortProductsByPopularity,
} from '@/lib/brandUtils';

interface ProductWithHidden extends Product {
  isHidden?: boolean;
}

interface StockHistoryRecord {
  _id: string;
  productId: string;
  productName: string;
  type: 'entrada' | 'salida' | 'merma';
  qty: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  createdAt: string;
}

export default function InventoryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [products, setProducts] = useState<ProductWithHidden[]>([]);
  const [mermas, setMermas] = useState<StockHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'STOCK' | 'MERMAS'>('STOCK');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStock, setFilterStock] = useState<'ALL' | 'OUT' | 'LOW'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');

  // Add Stock Modal
  const [adjustModal, setAdjustModal] = useState<{
    open: boolean;
    product: ProductWithHidden | null;
  }>({ open: false, product: null });
  const [addQty, setAddQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState('Entrada de stock proveedor');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // Movement History Modal
  const [historyModal, setHistoryModal] = useState<{
    open: boolean;
    product: ProductWithHidden | null;
    records: StockHistoryRecord[];
    loading: boolean;
  }>({ open: false, product: null, records: [], loading: false });

  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const triggerToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stock');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
      // Also fetch mermas
      const resMermas = await fetch('/api/stock?type=merma');
      if (resMermas.ok) {
        const dataMermas = await resMermas.json();
        setMermas(dataMermas.mermas || []);
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      triggerToast('Error cargando inventario', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchInventory();
    }
  }, [isAuthenticated]);

  // Open add stock modal
  const handleOpenAdjust = (prod: ProductWithHidden) => {
    setAdjustModal({ open: true, product: prod });
    setAddQty('1');
    setAdjustReason('Entrada de stock proveedor');
  };

  // Submit stock addition
  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal.product) return;

    const qtyNum = parseInt(addQty, 10);
    if (!qtyNum || isNaN(qtyNum) || qtyNum < 1) {
      triggerToast('Ingresa una cantidad válida (mínimo 1)', true);
      return;
    }

    setAdjustLoading(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          productId: adjustModal.product.id,
          qty: qtyNum,
          reason: adjustReason,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerToast(`+${qtyNum} unidades añadidas a ${adjustModal.product.modelo}`);
        setAdjustModal({ open: false, product: null });
        fetchInventory();
      } else {
        triggerToast(data.error || 'Error al actualizar stock', true);
      }
    } catch {
      triggerToast('Error de conexión', true);
    } finally {
      setAdjustLoading(false);
    }
  };

  // View movement history for product
  const handleViewHistory = async (prod: ProductWithHidden) => {
    setHistoryModal({ open: true, product: prod, records: [], loading: true });
    try {
      const res = await fetch(`/api/stock?productId=${prod.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryModal({
          open: true,
          product: prod,
          records: data.history || [],
          loading: false,
        });
      } else {
        triggerToast('Error al cargar movimientos', true);
        setHistoryModal((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      triggerToast('Error al conectar con la base de datos', true);
      setHistoryModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Brand counts (most products first)
  const brandCounts = useMemo(() => {
    return getBrandCounts(products);
  }, [products]);

  // Brand list sorted by frequency (majority of models first)
  const brands = useMemo(() => {
    return ['ALL', ...getSortedBrands(products)];
  }, [products]);

  // Filtered & Sorted Products
  const filtered = useMemo(() => {
    const filteredList = products.filter((p) => {
      if (filterStock === 'OUT' && p.stock > 0) return false;
      if (filterStock === 'LOW' && (p.stock <= 0 || p.stock > 2)) return false;

      if (!matchBrandFilter(p.marca, selectedBrand)) {
        return false;
      }

      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchModel = p.modelo.toLowerCase().includes(q);
        const matchBrand = p.marca.toLowerCase().includes(q);
        const matchQuality = p.calidad.toLowerCase().includes(q);
        return matchModel || matchBrand || matchQuality;
      }

      return true;
    });

    return sortProductsByPopularity(filteredList, brandCounts);
  }, [products, filterStock, selectedBrand, searchTerm, brandCounts]);

  // Filtered Mermas
  const filteredMermas = useMemo(() => {
    if (searchTerm.trim() === '') return mermas;
    const q = searchTerm.toLowerCase().trim();
    return mermas.filter(
      (m) =>
        m.productName.toLowerCase().includes(q) ||
        m.reason.toLowerCase().includes(q)
    );
  }, [mermas, searchTerm]);

  const totalMermaUnits = useMemo(() => {
    return mermas.reduce((acc, m) => acc + m.qty, 0);
  }, [mermas]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 space-y-4 text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-extrabold text-white">Acceso Denegado</h1>
          <p className="text-sm text-gray-400">
            Debes iniciar sesión en el panel de administrador primero.
          </p>
          <Link
            href="/admin"
            className="block px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-sm text-center"
          >
            Ir al Panel Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-[100] glass-panel px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border ${
            toastMessage.isError
              ? 'border-rose-500/60 bg-[#1A1118] text-rose-300 shadow-rose-950/50'
              : 'border-[#D4AF37]/40 bg-[#121522] text-white shadow-gold-glow'
          }`}
        >
          {toastMessage.isError ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustModal.open && adjustModal.product && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-7 border border-[#D4AF37]/30 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setAdjustModal({ open: false, product: null })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#E5C158] uppercase px-2 py-0.5 rounded-md bg-[#10131E] border border-white/10">
                {adjustModal.product.marca}
              </span>
              <h3 className="text-lg font-bold text-white leading-snug">
                {adjustModal.product.modelo}
              </h3>
              <p className="text-xs text-gray-400">
                Calidad: <strong className="text-gray-300">{adjustModal.product.calidad}</strong> • Stock actual:{' '}
                <strong className="text-emerald-400">{adjustModal.product.stock} uds</strong>
              </p>
            </div>

            <form onSubmit={handleConfirmAdjust} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Cantidad a Añadir (+ Unidades)
                </label>
                <input
                  type="number"
                  min="1"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Motivo / Nota de Entrada
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej. Compra mayorista lote #12"
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustModal({ open: false, product: null })}
                  className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="flex-1 py-3 rounded-xl gold-gradient-bg text-black text-xs font-extrabold shadow-gold-glow flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {adjustLoading ? 'Guardando...' : 'Confirmar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement History Modal */}
      {historyModal.open && historyModal.product && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-3xl p-6 border border-white/20 shadow-2xl space-y-4 max-h-[85vh] flex flex-col relative">
            <button
              onClick={() => setHistoryModal({ open: false, product: null, records: [], loading: false })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[10px] font-bold text-[#E5C158] uppercase">
                {historyModal.product.marca}
              </span>
              <h3 className="text-base font-bold text-white">
                Historial de Movimientos: {historyModal.product.modelo}
              </h3>
              <p className="text-xs text-gray-400">
                Stock actual: <strong className="text-white">{historyModal.product.stock} uds</strong>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {historyModal.loading ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  Cargando movimientos...
                </div>
              ) : historyModal.records.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  No hay movimientos registrados para este repuesto.
                </div>
              ) : (
                historyModal.records.map((rec) => (
                  <div
                    key={rec._id}
                    className="p-3 rounded-xl bg-[#10131E] border border-white/5 flex items-center justify-between text-xs gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          rec.type === 'entrada'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : rec.type === 'merma'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {rec.type === 'entrada' ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : rec.type === 'merma' ? (
                          <AlertOctagon className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              rec.type === 'entrada'
                                ? 'text-emerald-400'
                                : rec.type === 'merma'
                                ? 'text-rose-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {rec.type === 'entrada'
                              ? `+${rec.qty} Entrada`
                              : rec.type === 'merma'
                              ? `-${rec.qty} MERMA / ROTO`
                              : `-${rec.qty} Venta POS`}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 block">{rec.reason}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-gray-300 block font-semibold">
                        {rec.stockBefore} → <strong className="text-white">{rec.stockAfter}</strong> uds
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {new Date(rec.createdAt).toLocaleDateString('es-CU')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link
            href="/admin/pos"
            className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Volver al Terminal POS</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E5C158]/10 border border-[#D4AF37]/30">
            <Boxes className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="text-xs font-bold text-[#E5C158]">{products.length} Modelos Totales</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Title & View Toggle */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Control de Inventario & Stock
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-xl">
              Monitorea el inventario vendible en tiempo real, añade nuevas unidades de proveedores y consulta el registro de mermas y repuestos defectuosos.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5 bg-[#10131E] p-1 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => setCurrentView('STOCK')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
                currentView === 'STOCK'
                  ? 'gold-gradient-bg text-black shadow-gold-glow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Stock Activo</span>
            </button>
            <button
              onClick={() => setCurrentView('MERMAS')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
                currentView === 'MERMAS'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>Mermas & Bajas ({totalMermaUnits})</span>
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: ACTIVE INVENTORY & STOCK */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'STOCK' && (
          <>
            {/* Search & Stock Filter Bar */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por modelo o calidad para ajustar stock..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setFilterStock('ALL')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      filterStock === 'ALL'
                        ? 'gold-gradient-bg text-black'
                        : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterStock('LOW')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      filterStock === 'LOW'
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
                    }`}
                  >
                    Bajo Stock (1-2)
                  </button>
                  <button
                    onClick={() => setFilterStock('OUT')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      filterStock === 'OUT'
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
                    }`}
                  >
                    Agotados (0)
                  </button>
                </div>
              </div>

              {/* Brand Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {brands.map((b) => {
                  const count = b === 'ALL' ? products.length : brandCounts.get(b) || 0;
                  return (
                    <button
                      key={b}
                      onClick={() => setSelectedBrand(b)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                        selectedBrand === b
                          ? 'gold-gradient-bg text-black shadow-gold-glow scale-105'
                          : 'bg-[#10131E] text-gray-300 hover:text-white border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <span>{b === 'ALL' ? 'Todas las Marcas' : b}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                          selectedBrand === b
                            ? 'bg-black/20 text-black'
                            : 'bg-white/10 text-[#E5C158]'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inventory Cards Grid */}
            {loading ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-400 text-xs">Cargando inventario...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass-panel rounded-3xl p-16 text-center space-y-2 border border-white/10">
                <Boxes className="w-8 h-8 text-gray-600 mx-auto" />
                <p className="text-gray-300 font-bold text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((prod) => (
                  <div
                    key={prod.id}
                    className={`glass-card rounded-2xl p-4 border flex flex-col justify-between transition-all ${
                      prod.stock <= 0
                        ? 'border-rose-500/30 opacity-75'
                        : prod.stock <= 2
                        ? 'border-amber-500/30'
                        : 'border-white/10'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="text-[10px] font-bold text-[#E5C158] uppercase px-2 py-0.5 rounded-md bg-[#10131E] border border-white/10">
                          {prod.marca}
                        </span>
                        <span className="text-[10px] text-gray-300 font-semibold px-2 py-0.5 rounded-md bg-white/5">
                          {prod.calidad}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white leading-snug flex items-start gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span>{prod.modelo}</span>
                      </h3>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Stock Actual:</span>
                        <span
                          className={`font-extrabold ${
                            prod.stock <= 0
                              ? 'text-rose-400'
                              : prod.stock <= 2
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {prod.stock <= 0
                            ? 'Agotado (0)'
                            : `${prod.stock} ${prod.stock === 1 ? 'unidad' : 'unidades'}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenAdjust(prod)}
                          className="flex-1 py-2 px-3 rounded-xl gold-gradient-bg text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-gold-glow hover:scale-[1.02] transition-transform"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Stock</span>
                        </button>
                        <button
                          onClick={() => handleViewHistory(prod)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          title="Ver movimientos de stock"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: MERMAS & DEFECTIVE PARTS AUDIT */}
        {/* ------------------------------------------------------------- */}
        {currentView === 'MERMAS' && (
          <div className="space-y-4">
            <div className="glass-panel rounded-2xl p-5 border border-rose-500/30 bg-rose-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-rose-300 flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                  Registro de Mermas, Roturas y Garantías
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Estos repuestos fueron devueltos por fallas/rotura y fueron dados de baja permanentemente del inventario vendible.
                </p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-center shrink-0">
                <span className="text-xs font-bold text-gray-300 block">Total Piezas en Merma</span>
                <span className="text-xl font-extrabold text-rose-400 block">{totalMermaUnits} uds</span>
              </div>
            </div>

            {filteredMermas.length === 0 ? (
              <div className="glass-panel rounded-3xl p-16 text-center space-y-2 border border-white/10">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">No hay mermas registradas</h4>
                <p className="text-xs text-gray-400">
                  Cuando proceses una devolución seleccionando "Baja / Merma (Roto)", aparecerá registrada aquí automáticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredMermas.map((m) => (
                  <div
                    key={m._id}
                    className="glass-card rounded-2xl p-4 border border-rose-500/30 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-extrabold shrink-0">
                        <AlertOctagon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-white">{m.productName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {m.qty} {m.qty === 1 ? 'unidad' : 'unidades'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 block mt-0.5">
                          <strong>Motivo / Auditoría:</strong> {m.reason}
                        </span>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                      <span className="text-xs text-gray-400 block">
                        Registrado el {new Date(m.createdAt).toLocaleDateString('es-CU')} a las {new Date(m.createdAt).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
