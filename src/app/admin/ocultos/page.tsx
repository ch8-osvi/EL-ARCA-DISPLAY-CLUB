'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, EyeOff, RotateCcw, ShieldAlert, X, Plus, CheckCircle2 } from 'lucide-react';
import { sortProductsByPopularity } from '@/lib/brandUtils';

interface HiddenProduct {
  _id?: string;
  id: string;
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock: number;
  isHidden: boolean;
}

export default function OcultosPage() {
  const [hiddenProducts, setHiddenProducts] = useState<HiddenProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Restore Modal State
  const [restoreModal, setRestoreModal] = useState<{
    open: boolean;
    product: HiddenProduct | null;
  }>({ open: false, product: null });
  const [restoreStock, setRestoreStock] = useState('1');
  const [restoreLoading, setRestoreLoading] = useState(false);

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

  const fetchHidden = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products/hidden');
      if (res.ok) {
        const data = await res.json();
        const raw = data.products || [];
        setHiddenProducts(sortProductsByPopularity(raw));
      }
    } catch (err) {
      console.error('Error fetching hidden products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchHidden();
  }, [isAuthenticated]);

  const handleOpenRestore = (product: HiddenProduct) => {
    setRestoreModal({ open: true, product });
    setRestoreStock(product.stock > 0 ? product.stock.toString() : '1');
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreModal.product) return;

    const stockNum = parseInt(restoreStock, 10);
    if (!stockNum || isNaN(stockNum) || stockNum < 1) {
      triggerToast('Por favor ingresa un stock válido mayor a 0');
      return;
    }

    setRestoreLoading(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unhide',
          id: restoreModal.product.id,
          stock: stockNum,
        }),
      });

      if (res.ok) {
        setHiddenProducts((prev) => prev.filter((p) => p.id !== restoreModal.product?.id));
        triggerToast(`Producto reactivado con ${stockNum} uds en catálogo`);
        setRestoreModal({ open: false, product: null });
      } else {
        triggerToast('Error al restaurar producto');
      }
    } catch {
      triggerToast('Error de conexión');
    } finally {
      setRestoreLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 space-y-4 text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-extrabold text-white">Acceso Denegado</h1>
          <p className="text-sm text-gray-400">Debes iniciar sesión en el panel de administrador primero.</p>
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
        <div className="fixed bottom-6 right-6 z-50 glass-panel border border-[#D4AF37]/40 bg-[#121522] px-5 py-3.5 rounded-2xl shadow-gold-glow flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-white">{toastMessage}</span>
        </div>
      )}

      {/* Restore Stock Selection Modal */}
      {restoreModal.open && restoreModal.product && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 border border-emerald-500/40 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setRestoreModal({ open: false, product: null })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Reactivar Producto en Catálogo</h3>
              <p className="text-xs text-gray-400">
                <strong className="text-[#E5C158]">{restoreModal.product.marca} {restoreModal.product.modelo}</strong> ({restoreModal.product.calidad})
              </p>
            </div>

            <form onSubmit={handleConfirmRestore} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Cantidad de Stock para Reactivar <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={restoreStock}
                  onChange={(e) => setRestoreStock(e.target.value)}
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-emerald-400 focus:outline-none"
                  required
                  autoFocus
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  El producto volverá a ser visible para los clientes con este inventario inicial.
                </span>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRestoreModal({ open: false, product: null })}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={restoreLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg flex items-center justify-center gap-2"
                >
                  {restoreLoading ? 'Restaurando...' : 'Reactivar en Catálogo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simple Header */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link href="/admin" className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Volver al Panel</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30">
            <EyeOff className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-xs font-bold text-rose-300">{hiddenProducts.length} Ocultos</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-rose-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-300">
              <EyeOff className="w-3.5 h-3.5" />
              Archivo de Productos Ocultos
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Productos Ocultos / Eliminados
            </h1>
            <p className="text-sm text-gray-400 max-w-xl">
              Estos productos fueron ocultados automáticamente por stock 0 o borrado manual. 
              Puedes reactivarlos asignando la cantidad de stock inicial.
            </p>
          </div>
        </section>

        {/* Products Grid */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-rose-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm">Cargando productos ocultos...</p>
          </div>
        ) : hiddenProducts.length === 0 ? (
          <div className="glass-panel rounded-3xl py-20 px-6 text-center space-y-4 border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-[#171B2B] border border-white/10 flex items-center justify-center mx-auto text-gray-500">
              <EyeOff className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">Sin productos ocultos</h3>
            <p className="text-gray-400 text-sm">No hay productos ocultos en este momento. ¡El catálogo está completo!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {hiddenProducts.map((product) => (
              <div
                key={product.id}
                className="glass-card rounded-2xl p-4 border border-rose-500/20 flex flex-col gap-3 opacity-80 hover:opacity-100 transition-opacity"
              >
                {/* Hidden badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <EyeOff className="w-2.5 h-2.5" />
                    Oculto
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{product.id}</span>
                </div>

                {/* Brand */}
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest text-[#D4AF37] uppercase block">
                    {product.marca}
                  </span>
                  <h3 className="text-sm font-bold text-white leading-tight mt-0.5">{product.modelo}</h3>
                </div>

                {/* Quality & Price */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                  <span className="text-[10px] bg-[#171B2B] text-gray-300 px-2 py-0.5 rounded-lg border border-white/10 font-semibold">
                    {product.calidad}
                  </span>
                  <span className="text-base font-extrabold text-white">
                    ${product.precio.toFixed(2)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenRestore(product)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all hover:scale-105"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar al Catálogo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#06070B] py-6 mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs text-gray-500">
            EL ARCA <span className="text-[#D4AF37]">DISPLAY CLUB</span> — Panel de Administración
          </span>
        </div>
      </footer>
    </div>
  );
}
