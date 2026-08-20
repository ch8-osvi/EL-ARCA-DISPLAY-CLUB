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
  ShieldAlert,
  User,
  Bluetooth,
  Usb,
  RotateCcw,
  X,
  AlertCircle,
  Plus,
  Minus,
  Check,
  TrendingDown,
  Layers,
  AlertOctagon,
} from 'lucide-react';
import {
  printTicket,
  printViaBluetooth,
  printViaUsb,
  printRefundTicket,
  printRefundViaBluetooth,
  printRefundViaUsb,
  RefundTicketData,
} from '@/components/PrintTicket';

interface SaleItem {
  productId:   string;
  marca:       string;
  modelo:      string;
  calidad:     string;
  qty:         number;
  returnedQty?:number;
  precioUSD:   number;
  subtotalUSD: number;
}

interface SaleRefundLog {
  productId:   string;
  marca:       string;
  modelo:      string;
  calidad:     string;
  qty:         number;
  refundUSD:   number;
  refundCUP:   number;
  reason:      string;
  destination: 'stock' | 'merma';
  createdAt:   string;
}

interface SaleRecord {
  _id:              string;
  orderNumber:      string;
  clientName:       string;
  items:            SaleItem[];
  currency:         'USD' | 'CUP';
  exchangeRate:     number;
  subtotalUSD:      number;
  totalUSD:         number;
  totalCUP:         number;
  paid:             boolean;
  notes:            string;
  status?:          'COMPLETED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  totalRefundedUSD?:number;
  totalRefundedCUP?:number;
  refunds?:         SaleRefundLog[];
  createdAt:        string;
}

export default function SalesHistoryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [daily, setDaily] = useState<any>({
    todayTotalUSD:   0,
    todayTotalCUP:   0,
    todayRefundsUSD: 0,
    todayRefundsCUP: 0,
    todayNetUSD:     0,
    todayNetCUP:     0,
    todayPaidUSD:    0,
    todayPaidCUP:    0,
    count:           0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPaid, setFilterPaid] = useState<'ALL' | 'PAID' | 'PENDING' | 'REFUNDED'>('ALL');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Refund Modal State
  const [refundModal, setRefundModal] = useState<{
    open: boolean;
    sale: SaleRecord | null;
    returnQuantities: { [productId: string]: number };
    returnDestinations: { [productId: string]: 'stock' | 'merma' };
    reason: string;
    printOption: 'bluetooth' | 'usb' | 'system' | 'none';
    loading: boolean;
  }>({
    open: false,
    sale: null,
    returnQuantities: {},
    returnDestinations: {},
    reason: '',
    printOption: 'bluetooth',
    loading: false,
  });

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
      triggerToast('Error cargando historial', true);
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
        fetchSales();
        triggerToast(
          data.sale.paid ? '¡Orden marcada como PAGADA con éxito!' : 'Orden marcada como PENDIENTE'
        );
      }
    } catch {
      triggerToast('Error al actualizar pago', true);
    }
  };

  const handleReprint = async (sale: SaleRecord, mode: 'bluetooth' | 'usb' | 'system' = 'bluetooth') => {
    const ticketData = {
      orderNumber:  sale.orderNumber,
      clientName:   sale.clientName,
      items:        sale.items,
      currency:     sale.currency,
      exchangeRate: sale.exchangeRate,
      subtotalUSD:  sale.subtotalUSD,
      totalUSD:     sale.totalUSD,
      totalCUP:     sale.totalCUP,
      paid:         sale.paid,
      notes:        sale.notes,
      createdAt:    sale.createdAt,
    };

    if (mode === 'bluetooth') {
      triggerToast('Buscando impresora Bluetooth...');
      const res = await printViaBluetooth(ticketData, 1);
      if (res.success) {
        triggerToast('¡Ticket reimpreso por Bluetooth!');
      } else {
        triggerToast(res.error || 'Error Bluetooth, usando ventana de impresión', true);
        printTicket(ticketData, 1);
      }
    } else if (mode === 'usb') {
      triggerToast('Conectando a puerto USB...');
      const res = await printViaUsb(ticketData, 1);
      if (res.success) {
        triggerToast('¡Ticket reimpreso por USB!');
      } else {
        triggerToast(res.error || 'Error USB, usando ventana de impresión', true);
        printTicket(ticketData, 1);
      }
    } else {
      printTicket(ticketData, 1);
    }
  };

  // Open Refund Modal
  const handleOpenRefundModal = (sale: SaleRecord) => {
    const initialQuantities: { [productId: string]: number } = {};
    const initialDestinations: { [productId: string]: 'stock' | 'merma' } = {};

    sale.items.forEach((item) => {
      initialQuantities[item.productId] = 0;
      initialDestinations[item.productId] = 'stock';
    });

    setRefundModal({
      open: true,
      sale,
      returnQuantities: initialQuantities,
      returnDestinations: initialDestinations,
      reason: '',
      printOption: 'bluetooth',
      loading: false,
    });
  };

  // Adjust return quantity in modal
  const handleSetReturnQty = (productId: string, delta: number, maxAllowed: number) => {
    setRefundModal((prev) => {
      const current = prev.returnQuantities[productId] || 0;
      const next = Math.max(0, Math.min(maxAllowed, current + delta));
      return {
        ...prev,
        returnQuantities: { ...prev.returnQuantities, [productId]: next },
      };
    });
  };

  // Set destination for item
  const handleSetItemDest = (productId: string, dest: 'stock' | 'merma') => {
    setRefundModal((prev) => ({
      ...prev,
      returnDestinations: { ...prev.returnDestinations, [productId]: dest },
    }));
  };

  // Submit Refund
  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModal.sale) return;

    if (!refundModal.reason.trim()) {
      triggerToast('Debes ingresar el motivo de la devolución', true);
      return;
    }

    const returnsToSubmit = Object.entries(refundModal.returnQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        productId,
        qty,
        destination: refundModal.returnDestinations[productId] || 'stock',
      }));

    if (returnsToSubmit.length === 0) {
      triggerToast('Selecciona al menos 1 unidad para devolver', true);
      return;
    }

    setRefundModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refund',
          saleId: refundModal.sale._id,
          returns: returnsToSubmit,
          reason: refundModal.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.error || 'Error procesando devolución', true);
        setRefundModal((prev) => ({ ...prev, loading: false }));
        return;
      }

      triggerToast('¡Devolución procesada con éxito!');

      // Print Refund Receipt if requested
      if (refundModal.printOption !== 'none') {
        const refundTicketData: RefundTicketData = {
          orderNumber: refundModal.sale.orderNumber,
          clientName: refundModal.sale.clientName,
          items: data.refundLogs.map((log: any) => ({
            marca: log.marca,
            modelo: log.modelo,
            calidad: log.calidad,
            qty: log.qty,
            refundUSD: log.refundUSD,
            refundCUP: log.refundCUP,
            destination: log.destination,
          })),
          reason: refundModal.reason,
          exchangeRate: refundModal.sale.exchangeRate,
          totalRefundUSD: data.totalRefundUSD,
          totalRefundCUP: data.totalRefundCUP,
          createdAt: new Date(),
        };

        if (refundModal.printOption === 'bluetooth') {
          printRefundViaBluetooth(refundTicketData);
        } else if (refundModal.printOption === 'usb') {
          printRefundViaUsb(refundTicketData);
        } else {
          printRefundTicket(refundTicketData);
        }
      }

      setRefundModal({
        open: false,
        sale: null,
        returnQuantities: {},
        returnDestinations: {},
        reason: '',
        printOption: 'bluetooth',
        loading: false,
      });

      fetchSales();
    } catch (err) {
      console.error('Error submitting refund:', err);
      triggerToast('Error de conexión al procesar devolución', true);
      setRefundModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (filterPaid === 'PAID' && !s.paid) return false;
      if (filterPaid === 'PENDING' && s.paid) return false;
      if (filterPaid === 'REFUNDED' && s.status !== 'REFUNDED' && s.status !== 'PARTIALLY_REFUNDED') return false;

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
        const matchReason = (s.refunds || []).some((r) => r.reason.toLowerCase().includes(q));
        return matchOrder || matchClient || matchItems || matchReason;
      }
      return true;
    });
  }, [sales, filterPaid, searchTerm]);

  // Total refund calculation in modal
  const modalRefundTotals = useMemo(() => {
    if (!refundModal.sale) return { totalUSD: 0, totalCUP: 0, itemsCount: 0, stockCount: 0, mermaCount: 0 };
    let totalUSD = 0;
    let itemsCount = 0;
    let stockCount = 0;
    let mermaCount = 0;

    refundModal.sale.items.forEach((item) => {
      const qty = refundModal.returnQuantities[item.productId] || 0;
      if (qty > 0) {
        totalUSD += item.precioUSD * qty;
        itemsCount += qty;
        if ((refundModal.returnDestinations[item.productId] || 'stock') === 'stock') {
          stockCount += qty;
        } else {
          mermaCount += qty;
        }
      }
    });

    const totalCUP = totalUSD * refundModal.sale.exchangeRate;
    return { totalUSD, totalCUP, itemsCount, stockCount, mermaCount };
  }, [refundModal]);

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
      {/* Toast Notification */}
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

      {/* Refund / Return Modal */}
      {refundModal.open && refundModal.sale && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl glass-panel rounded-3xl p-6 sm:p-7 border border-rose-500/40 shadow-2xl space-y-5 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setRefundModal({ open: false, sale: null, returnQuantities: {}, returnDestinations: {}, reason: '', printOption: 'bluetooth', loading: false })}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Devolución / Reembolso de Productos</h3>
              <p className="text-xs text-gray-400">
                Orden <strong className="text-[#E5C158]">#{refundModal.sale.orderNumber}</strong> — Cliente: {refundModal.sale.clientName || 'Consumidor Final'}
              </p>
            </div>

            <form onSubmit={handleConfirmRefund} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">
                  Selecciona la cantidad y el destino de cada repuesto:
                </label>

                {refundModal.sale.items.map((item) => {
                  const alreadyReturned = item.returnedQty || 0;
                  const maxAvailable = item.qty - alreadyReturned;
                  const selectedQty = refundModal.returnQuantities[item.productId] || 0;
                  const currentDest = refundModal.returnDestinations[item.productId] || 'stock';

                  return (
                    <div
                      key={item.productId}
                      className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                        selectedQty > 0
                          ? currentDest === 'merma'
                            ? 'bg-rose-950/30 border-rose-500/60'
                            : 'bg-emerald-950/20 border-emerald-500/50'
                          : 'bg-[#10131E] border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-[#D4AF37] font-bold uppercase block">
                            {item.marca}
                          </span>
                          <h4 className="text-xs font-bold text-white truncate">{item.modelo}</h4>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                            <span>{item.calidad}</span>
                            <span>•</span>
                            <span>Compradas: <strong>{item.qty}</strong></span>
                            {alreadyReturned > 0 && (
                              <span className="text-rose-400">(Devueltas: {alreadyReturned})</span>
                            )}
                          </div>
                        </div>

                        {/* Qty Controls */}
                        {maxAvailable <= 0 ? (
                          <span className="text-[11px] font-bold text-rose-400 px-2.5 py-1 bg-rose-500/10 rounded-lg">
                            Devuelto Totalmente
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSetReturnQty(item.productId, -1, maxAvailable)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-xs font-extrabold text-white">
                              {selectedQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSetReturnQty(item.productId, 1, maxAvailable)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Destination Selector when selectedQty > 0 */}
                      {selectedQty > 0 && (
                        <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-gray-300">
                            ¿Estado del repuesto devuelto?
                          </span>
                          <div className="grid grid-cols-2 gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSetItemDest(item.productId, 'stock')}
                              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                                currentDest === 'stock'
                                  ? 'bg-emerald-600 text-white shadow-lg'
                                  : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
                              }`}
                            >
                              <span>🟢 Reintegrar a Stock</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetItemDest(item.productId, 'merma')}
                              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                                currentDest === 'merma'
                                  ? 'bg-rose-600 text-white shadow-lg'
                                  : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
                              }`}
                            >
                              <span>🔴 Baja / Merma (Roto)</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Reason for Refund (Mandatory) */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Motivo de la Devolución / Reembolso <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={refundModal.reason}
                  onChange={(e) => setRefundModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ej. Pantalla con flex dañado / Modelo incompatible traído por cliente..."
                  className="w-full px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-600 text-xs focus:outline-none focus:border-rose-400 transition-all resize-none"
                />
              </div>

              {/* Print Receipt Option */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                  Comprobante de Devolución
                </label>
                <div className="grid grid-cols-4 gap-1 bg-[#10131E] p-1 rounded-xl border border-white/10 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setRefundModal((prev) => ({ ...prev, printOption: 'bluetooth' }))}
                    className={`py-1 px-1 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      refundModal.printOption === 'bluetooth' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Bluetooth className="w-3 h-3" />
                    <span>Bluetooth</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundModal((prev) => ({ ...prev, printOption: 'usb' }))}
                    className={`py-1 px-1 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      refundModal.printOption === 'usb' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Usb className="w-3 h-3" />
                    <span>USB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundModal((prev) => ({ ...prev, printOption: 'system' }))}
                    className={`py-1 px-1 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      refundModal.printOption === 'system' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Printer className="w-3 h-3" />
                    <span>Sistema</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundModal((prev) => ({ ...prev, printOption: 'none' }))}
                    className={`py-1 px-1 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      refundModal.printOption === 'none' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>Sin Ticket</span>
                  </button>
                </div>
              </div>

              {/* Refund Summary Box */}
              <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-2 text-xs">
                <div className="flex justify-between text-gray-300">
                  <span>Productos a devolver:</span>
                  <strong className="text-white">
                    {modalRefundTotals.itemsCount} uds{' '}
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({modalRefundTotals.stockCount} a Stock / {modalRefundTotals.mermaCount} a Merma)
                    </span>
                  </strong>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Reembolso Total USD:</span>
                  <strong className="text-rose-400 text-sm font-extrabold">-${modalRefundTotals.totalUSD.toFixed(2)} USD</strong>
                </div>
                <div className="flex justify-between text-gray-400 text-[11px]">
                  <span>Equivalente en CUP:</span>
                  <span className="font-semibold text-rose-300">
                    -{modalRefundTotals.totalCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP
                  </span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRefundModal({ open: false, sale: null, returnQuantities: {}, returnDestinations: {}, reason: '', printOption: 'bluetooth', loading: false })}
                  className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={refundModal.loading || modalRefundTotals.itemsCount === 0}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {refundModal.loading ? 'Procesando...' : 'Confirmar Devolución'}
                </button>
              </div>
            </form>
          </div>
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
        {/* Daily Cash & Refund Summary Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* USD Cash Drawer */}
          <div className="glass-card rounded-2xl p-5 border border-emerald-500/40 relative overflow-hidden bg-emerald-950/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Caja USD Hoy (Efectivo)
              </span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              ${(daily.todayNetUSD !== undefined ? daily.todayNetUSD : 0).toFixed(2)} USD
            </div>
            <div className="text-[11px] text-gray-400 mt-1 space-y-0.5">
              <div className="flex justify-between">
                <span>Ventas cobradas:</span>
                <strong className="text-emerald-300">${(daily.todayGrossUSD || 0).toFixed(2)}</strong>
              </div>
              {daily.todayRefundsUSD > 0 && (
                <div className="flex justify-between text-rose-400 font-semibold">
                  <span>Devoluciones:</span>
                  <span>-${daily.todayRefundsUSD.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500 text-[10px] pt-1 border-t border-white/5">
                <span>{daily.usdCount || 0} órdenes en USD</span>
                {daily.todayPendingUSD > 0 && (
                  <span className="text-amber-400 font-semibold">Pendiente: ${daily.todayPendingUSD.toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>

          {/* CUP Cash Drawer */}
          <div className="glass-card rounded-2xl p-5 border border-[#D4AF37]/40 relative overflow-hidden bg-[#121626]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#E5C158]">
                Caja CUP Hoy (Efectivo)
              </span>
              <Banknote className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              {(daily.todayNetCUP !== undefined ? daily.todayNetCUP : 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} CUP
            </div>
            <div className="text-[11px] text-gray-400 mt-1 space-y-0.5">
              <div className="flex justify-between">
                <span>Ventas cobradas:</span>
                <strong className="text-[#F3E0A9]">{(daily.todayGrossCUP || 0).toLocaleString()} CUP</strong>
              </div>
              {daily.todayRefundsCUP > 0 && (
                <div className="flex justify-between text-rose-400 font-semibold">
                  <span>Devoluciones:</span>
                  <span>-{(daily.todayRefundsCUP || 0).toLocaleString()} CUP</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500 text-[10px] pt-1 border-t border-white/5">
                <span>{daily.cupCount || 0} órdenes en CUP</span>
                {daily.todayPendingCUP > 0 && (
                  <span className="text-amber-400 font-semibold">Pendiente: {(daily.todayPendingCUP || 0).toLocaleString()} CUP</span>
                )}
              </div>
            </div>
          </div>

          {/* Orders Count Today */}
          <div className="glass-card rounded-2xl p-5 border border-blue-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Órdenes de Hoy
              </span>
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">{daily.count || 0}</div>
            <div className="text-[11px] text-gray-400 mt-1 flex justify-between">
              <span>{daily.usdCount || 0} en USD</span>
              <span>•</span>
              <span>{daily.cupCount || 0} en CUP</span>
            </div>
          </div>

          {/* Historic Total */}
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
              placeholder="Buscar por # de orden, cliente, modelo, motivo o merma..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1">
            <button
              onClick={() => setFilterPaid('ALL')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterPaid === 'ALL'
                  ? 'gold-gradient-bg text-black'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterPaid('PAID')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterPaid === 'PAID'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Pagados
            </button>
            <button
              onClick={() => setFilterPaid('PENDING')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterPaid === 'PENDING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilterPaid('REFUNDED')}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterPaid === 'REFUNDED'
                  ? 'bg-rose-600 text-white'
                  : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              Con Devolución
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

              const totalItemsPurchased = sale.items.reduce((acc, i) => acc + i.qty, 0);
              const totalItemsReturned = sale.items.reduce((acc, i) => acc + (i.returnedQty || 0), 0);
              const canRefund = totalItemsReturned < totalItemsPurchased;

              return (
                <div
                  key={sale._id}
                  className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all space-y-4 ${
                    sale.status === 'REFUNDED'
                      ? 'border-rose-500/40 bg-rose-950/10'
                      : sale.status === 'PARTIALLY_REFUNDED'
                      ? 'border-amber-500/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Summary Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#10131E] border border-white/10 flex items-center justify-center font-bold text-xs text-[#E5C158]">
                        #{sale.orderNumber.slice(-4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-white tracking-wide">
                            Orden #{sale.orderNumber}
                          </span>
                          {/* Currency Badge */}
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              (sale.currency || 'USD') === 'USD'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-[#E5C158]/15 text-[#E5C158] border-[#D4AF37]/30'
                            }`}
                          >
                            {(sale.currency || 'USD') === 'USD' ? '💵 Pago USD' : '🇨🇺 Pago CUP'}
                          </span>

                          <button
                            onClick={() => handleTogglePaid(sale._id)}
                            className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1 hover:scale-105 active:scale-95 ${
                              sale.paid
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
                            }`}
                            title="Haz clic para cambiar entre Pagado / Pendiente"
                          >
                            <span>{sale.paid ? '✓ Pagado' : '⏳ Pendiente (Clic para Cobrar)'}</span>
                          </button>

                          {sale.status === 'REFUNDED' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              Reembolsado Total
                            </span>
                          )}

                          {sale.status === 'PARTIALLY_REFUNDED' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Devolución Parcial ({totalItemsReturned}/{totalItemsPurchased})
                            </span>
                          )}
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
                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5 flex-wrap">
                      <div className="text-left sm:text-right">
                        {(sale.currency || 'USD') === 'USD' ? (
                          <>
                            <span className="text-base font-extrabold text-[#F3E0A9] block">
                              ${sale.totalUSD.toFixed(2)} USD
                            </span>
                            <span className="text-[11px] font-semibold text-gray-400 block">
                              ≈ {sale.totalCUP.toLocaleString()} CUP (Tasa {sale.exchangeRate})
                            </span>
                            {(sale.totalRefundedUSD || 0) > 0 && (
                              <span className="text-[10px] font-bold text-rose-400 block">
                                Reembolsado: -${sale.totalRefundedUSD?.toFixed(2)} USD
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-base font-extrabold text-[#E5C158] block">
                              {sale.totalCUP.toLocaleString()} CUP
                            </span>
                            <span className="text-[11px] font-semibold text-gray-400 block">
                              ≈ ${sale.totalUSD.toFixed(2)} USD (Tasa {sale.exchangeRate})
                            </span>
                            {(sale.totalRefundedCUP || 0) > 0 && (
                              <span className="text-[10px] font-bold text-rose-400 block">
                                Reembolsado: -{sale.totalRefundedCUP?.toLocaleString()} CUP
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Refund Action Button */}
                        {canRefund && (
                          <button
                            onClick={() => handleOpenRefundModal(sale)}
                            className="px-2.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-all"
                            title="Hacer Devolución / Reembolso"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                            <span className="hidden md:inline">Devolver</span>
                          </button>
                        )}

                        {/* Print Ticket Buttons */}
                        <button
                          onClick={() => handleReprint(sale, 'bluetooth')}
                          className="px-2.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1 transition-all"
                          title="Imprimir directo por Bluetooth"
                        >
                          <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline">Bluetooth</span>
                        </button>

                        <button
                          onClick={() => handleReprint(sale, 'system')}
                          className="px-2.5 py-2 rounded-xl bg-[#10131E] hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-bold flex items-center gap-1 transition-all"
                          title="Imprimir vía navegador / PDF"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span className="hidden sm:inline">Sistema</span>
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

                  {/* Expanded Item Breakdown & Refund History */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-white/10 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Productos en esta orden ({sale.items.length}):
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {sale.items.map((item, idx) => {
                            const returned = item.returnedQty || 0;
                            return (
                              <div
                                key={idx}
                                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                  returned > 0
                                    ? 'bg-rose-950/20 border-rose-500/30'
                                    : 'bg-[#10131E] border-white/5'
                                }`}
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
                                  {returned > 0 && (
                                    <span className="text-[10px] font-bold text-rose-400 block mt-0.5">
                                      Devuelto: {returned} uds
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Refund Audit Logs */}
                      {(sale.refunds || []).length > 0 && (
                        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
                          <h5 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            Registro de Devoluciones Realizadas:
                          </h5>
                          <div className="space-y-1.5">
                            {sale.refunds?.map((refLog, rIdx) => (
                              <div
                                key={rIdx}
                                className="text-xs p-2.5 rounded-xl bg-black/40 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-white">
                                      {refLog.marca} {refLog.modelo} ({refLog.calidad}) — {refLog.qty} ud(s)
                                    </span>
                                    <span
                                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                                        refLog.destination === 'merma'
                                          ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                                          : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                                      }`}
                                    >
                                      {refLog.destination === 'merma' ? '🔴 ENVIADO A MERMA' : '🟢 REINTEGRADO A STOCK'}
                                    </span>
                                  </div>
                                  <span className="text-gray-400 block text-[11px] mt-0.5">
                                    <strong>Motivo:</strong> {refLog.reason}
                                  </span>
                                </div>
                                <div className="text-left sm:text-right shrink-0">
                                  <span className="text-rose-400 font-extrabold block">
                                    -${refLog.refundUSD.toFixed(2)} USD (-{refLog.refundCUP.toLocaleString()} CUP)
                                  </span>
                                  <span className="text-[10px] text-gray-500">
                                    {new Date(refLog.createdAt).toLocaleString('es-CU')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sale.notes && (
                        <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-300">
                          <strong className="text-gray-400">Notas Iniciales: </strong>
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
