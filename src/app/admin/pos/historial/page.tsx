'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  History,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Banknote,
  Calendar,
  Layers,
  Smartphone,
  ShieldAlert,
  FileText,
  User,
} from 'lucide-react';
import { TicketContent, printTicket } from '../../../../components/PrintTicket';

interface SaleItem {
  productId: string;
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  precioUSD: number;
  subtotalUSD: number;
}

interface SaleRecord {
  _id: string;
  orderNumber: string;
  clientName: string;
  items: SaleItem[];
  currency: 'USD' | 'CUP';
  exchangeRate: number;
  subtotalUSD: number;
  totalUSD: number;
  totalCUP: number;
  paid: boolean;
  notes: string;
  createdAt: string;
}

export default function SalesHistoryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [daily, setDaily] = useState<any>({
    todayTotalUSD: 0,
    todayTotalCUP: 0,
    todayPaidUSD: 0,
    todayPaidCUP: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPaid, setFilterPaid] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
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

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales');
      if (res.ok) {
        const data = await res.json();
        setSales(data.sales || []);
        if (data.daily) setDaily(data.daily);
      }
    } catch (err) {
      console.error('Error loading sales:', err);
      triggerToast('Error cargando historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSales();
    }
  }, [isAuthenticated]);

  const handleTogglePaid = async (saleId: string) => {
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-paid', saleId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSales((prev) =>
          prev.map((s) => (s._id === saleId ? { ...s, paid: !s.paid } : s))
        );
        triggerToast('Estado de pago actualizado');
      }
    } catch {
      triggerToast('Error al actualizar pago');
    }
  };

  const handleReprint = (sale: SaleRecord) => {
    printTicket({
      orderNumber: sale.orderNumber,
      clientName: sale.clientName,
      items: sale.items,
      currency: sale.currency,
      exchangeRate: sale.exchangeRate,
      subtotalUSD: sale.subtotalUSD,
      totalUSD: sale.totalUSD,
      totalCUP: sale.totalCUP,
      paid: sale.paid,
      notes: sale.notes,
      createdAt: sale.createdAt,
    });
  };

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterPaid === 'PAID' && !s.paid) return false;
      if (filterPaid === 'PENDING' && s.paid) return false;

      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchOrder = s.orderNumber.toLowerCase().includes(q);
        const matchClient = (s.clientName || '').toLowerCase().includes(q);
        const matchItems = s.items.some(
          (i) =>
            i.modelo.toLowerCase().includes(q) ||
            i.marca.toLowerCase().includes(q) ||
            i.calidad.toLowerCase().includes(q)
        );
        return matchOrder || matchClient || matchItems;
      }
      return true;
    });
  }, [sales, filterPaid, searchTerm]);

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

      {/* Header */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link
            href="/admin/pos"
            className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Volver al Terminal POS</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30">
            <History className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold text-blue-300">
              {sales.length} Ventas Registradas
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Daily Cash Summary Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5 border border-emerald-500/30 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Recaudado Hoy (USD)
              </span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              ${daily.todayTotalUSD.toFixed(2)}
            </div>
            <span className="text-[11px] text-gray-400">
              Pagado: ${daily.todayPaidUSD.toFixed(2)} USD
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-[#D4AF37]/30 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#E5C158]">
                Recaudado Hoy (CUP)
              </span>
              <Banknote className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              {daily.todayTotalCUP.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} CUP
            </div>
            <span className="text-[11px] text-gray-400">
              Pagado: {daily.todayPaidCUP.toLocaleString()} CUP
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-blue-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Órdenes de Hoy
              </span>
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{daily.count}</div>
            <span className="text-[11px] text-gray-400">Ventas registradas hoy</span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Total Histórico
              </span>
              <History className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{sales.length}</div>
            <span className="text-[11px] text-gray-400">Órdenes totales en base de datos</span>
          </div>
        </section>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por # de orden (ej. 0817...), cliente o modelo..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setFilterPaid('ALL')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterPaid === 'ALL'
                  ? 'gold-gradient-bg text-black'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterPaid('PAID')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterPaid === 'PAID'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Pagados
            </button>
            <button
              onClick={() => setFilterPaid('PENDING')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterPaid === 'PENDING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Pendientes
            </button>
          </div>
        </div>

        {/* Sales Table */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-xs">Cargando ventas...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="glass-panel rounded-3xl p-16 text-center space-y-3 border border-white/10">
            <History className="w-10 h-10 text-gray-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No se encontraron ventas</h3>
            <p className="text-xs text-gray-400">
              Registra una nueva orden desde el terminal POS para verla reflejada aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSales.map((sale) => {
              const isExpanded = expandedOrder === sale._id;
              const dateFormatted = new Date(sale.createdAt).toLocaleString('es-CU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={sale._id}
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-white/20 transition-all space-y-4"
                >
                  {/* Summary Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#10131E] border border-white/10 flex items-center justify-center font-bold text-xs text-[#E5C158]">
                        #{sale.orderNumber.slice(-4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white tracking-wide">
                            Orden #{sale.orderNumber}
                          </span>
                          <button
                            onClick={() => handleTogglePaid(sale._id)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                              sale.paid
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {sale.paid ? '✓ Pagado' : '○ Pendiente'}
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {dateFormatted}
                          </span>
                          {sale.clientName && (
                            <span className="flex items-center gap-1 text-gray-300">
                              <User className="w-3 h-3" /> {sale.clientName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right summary and actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                      <div className="text-left sm:text-right">
                        <span className="text-base font-extrabold text-[#F3E0A9] block">
                          ${sale.totalUSD.toFixed(2)} USD
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {sale.totalCUP.toLocaleString()} CUP (Tasa {sale.exchangeRate})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleReprint(sale)}
                          className="px-3 py-2 rounded-xl bg-[#10131E] hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-all"
                          title="Reimprimir Ticket Térmico"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span className="hidden sm:inline">Ticket</span>
                        </button>

                        <button
                          onClick={() => setExpandedOrder(isExpanded ? null : sale._id)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Breakdown */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Productos en esta orden ({sale.items.length}):
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {sale.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-[#10131E] border border-white/5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="text-[10px] text-[#D4AF37] font-bold uppercase block">
                                {item.marca}
                              </span>
                              <span className="font-bold text-white block">{item.modelo}</span>
                              <span className="text-[10px] text-gray-400">{item.calidad}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-gray-300 block">
                                x{item.qty} (${item.precioUSD} c/u)
                              </span>
                              <span className="font-extrabold text-[#F3E0A9]">
                                ${item.subtotalUSD.toFixed(2)} USD
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {sale.notes && (
                        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300">
                          <strong className="text-gray-400">Notas: </strong>
                          {sale.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
