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
  AlertTriangle,
  Smartphone,
  Tag,
  X,
  RotateCcw,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Layers,
} from 'lucide-react';
import { Product } from '../../../../lib/types';

interface ProductWithHidden extends Product {
  isHidden?: boolean;
}

interface StockHistoryRecord {
  _id: string;
  productId: string;
  productName: string;
  type: 'entrada' | 'salida';
  qty: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  createdAt: string;
}

export default function InventoryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [products, setProducts] = useState<ProductWithHidden[]>([]);
  const [loading, setLoading] = useState(true);
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

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
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
    } catch (err) {
      console.error('Error fetching inventory:', err);
      triggerToast('Error cargando inventario');
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
      triggerToast('Ingresa una cantidad válida (mínimo 1)');
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
        triggerToast(`+${qtyNum} unidades agregadas a ${adjustModal.product.modelo}`);
        setAdjustModal({ open: false, product: null });
        fetchInventory();
      } else {
        triggerToast(data.error || 'Error al actualizar stock');
      }
    } catch {
      triggerToast('Error de conexión');
    } finally {
      setAdjustLoading(false);
    }
  };

  // Open movement history modal
  const handleOpenHistory = async (prod: ProductWithHidden) => {
    setHistoryModal({ open: true, product: prod, records: [], loading: true });
    try {
      const res = await fetch(`/api/stock?productId=${encodeURIComponent(prod.id)}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryModal((prev) => ({
          ...prev,
          records: data.history || [],
          loading: false,
        }));
      }
    } catch {
      setHistoryModal((prev) => ({ ...prev, loading: false }));
      triggerToast('Error cargando historial de movimientos');
    }
  };

  // Brands
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.marca) set.add(p.marca);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [products]);

  // Filtered List
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedBrand !== 'ALL' && p.marca.toUpperCase() !== selectedBrand.toUpperCase()) {
        return false;
      }
      if (filterStock === 'OUT' && (p.stock > 0 || p.isHidden === false)) return false;
      if (filterStock === 'LOW' && (p.stock <= 0 || p.stock > 2)) return false;

      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchMarca = p.marca.toLowerCase().includes(q);
        const matchModelo = p.modelo.toLowerCase().includes(q);
        const matchCalidad = p.calidad.toLowerCase().includes(q);
        return matchMarca || matchModelo || matchCalidad;
      }
      return true;
    });
  }, [products, selectedBrand, filterStock, searchTerm]);

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
        <div className="fixed bottom-6 right-6 z-[100] glass-panel border border-[#D4AF37]/40 bg-[#121522] px-5 py-3.5 rounded-2xl shadow-gold-glow flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-white">{toastMessage}</span>
        </div>
      )}

      {/* Add Stock Modal */}
      {adjustModal.open && adjustModal.product && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/40 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setAdjustModal({ open: false, product: null })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="w-10 h-10 rounded-xl gold-gradient-bg p-[1px] flex items-center justify-center">
                <div className="w-full h-full bg-[#10131E] rounded-[11px] flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[#D4AF37]" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white">Agregar Unidades al Stock</h3>
              <p className="text-xs text-gray-400">
                <strong className="text-[#E5C158]">{adjustModal.product.marca} {adjustModal.product.modelo}</strong> — {adjustModal.product.calidad}
              </p>
            </div>

            <form onSubmit={handleConfirmAdjust} className="space-y-4">
              <div className="p-3 rounded-xl bg-[#10131E] border border-white/5 flex justify-between items-center text-xs">
                <span className="text-gray-400">Stock Actual en DB:</span>
                <span className="font-extrabold text-white text-sm">
                  {adjustModal.product.stock} unidades
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Cantidad a Agregar <span className="text-[#D4AF37]">*</span>
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
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="flex-1 py-2.5 rounded-xl gold-gradient-bg text-black text-xs font-extrabold shadow-gold-glow flex items-center justify-center gap-2"
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
          <div className="w-full max-w-lg glass-panel rounded-3xl p-6 border border-blue-500/40 shadow-2xl space-y-4 relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setHistoryModal({ open: false, product: null, records: [], loading: false })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                Historial de Movimientos de Stock
              </h3>
              <p className="text-xs text-gray-400">
                {historyModal.product.marca} {historyModal.product.modelo} ({historyModal.product.calidad})
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {historyModal.loading ? (
                <div className="py-12 text-center text-xs text-gray-400">Cargando registros...</div>
              ) : historyModal.records.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-500">
                  Sin movimientos registrados para este repuesto.
                </div>
              ) : (
                historyModal.records.map((rec) => (
                  <div
                    key={rec._id}
                    className="p-3 rounded-xl bg-[#10131E] border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {rec.type === 'entrada' ? (
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                          <ArrowDownRight className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <span className="font-bold text-white block capitalize">
                          {rec.type === 'entrada' ? `+${rec.qty} Entrada` : `-${rec.qty} Salida`}
                        </span>
                        <span className="text-[10px] text-gray-400 block">{rec.reason}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">
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
        {/* Header Title */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Control de Inventario & Stock
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-xl">
            Monitorea el inventario disponible en tiempo real, añade nuevas unidades recibidas de proveedores y audita el historial de entradas y salidas.
          </p>
        </section>

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
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {brands.map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBrand(b)}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  selectedBrand === b
                    ? 'bg-[#E5C158] text-black'
                    : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                {b === 'ALL' ? 'Todas las Marcas' : b}
              </button>
            ))}
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
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {prod.stock <= 0 ? '0 uds (Agotado)' : `${prod.stock} uds`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAdjust(prod)}
                      className="flex-1 py-2 rounded-xl gold-gradient-bg text-black text-xs font-bold flex items-center justify-center gap-1 shadow-gold-glow hover:scale-105 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>+ Stock</span>
                    </button>

                    <button
                      onClick={() => handleOpenHistory(prod)}
                      className="p-2 rounded-xl bg-[#10131E] hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-all"
                      title="Ver historial de movimientos"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
