'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  History,
  Boxes,
  ShieldAlert,
  Smartphone,
  CreditCard,
  Banknote,
  Layers,
  Bluetooth,
  Usb,
} from 'lucide-react';
import { Product } from '@/lib/types';
import {
  TicketContent,
  printTicket,
  printViaBluetooth,
  printViaUsb,
} from '@/components/PrintTicket';

interface CartItem {
  productId: string;
  marca: string;
  modelo: string;
  calidad: string;
  qty: number;
  precioUSD: number;
  stockAvailable: number;
}

export default function PosPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientName, setClientName] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CUP'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(300);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState<string>('300');
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [copies, setCopies] = useState<number>(1);
  const [printMode, setPrintMode] = useState<'bluetooth' | 'usb' | 'system'>('bluetooth');

  // Status & Modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  const triggerToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Auth check
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch products & exchange rate
  const fetchProductsAndRate = async () => {
    setLoading(true);
    try {
      const [prodRes, rateRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/exchange-rate'),
      ]);

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);
      }
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        if (rateData.rate) {
          setExchangeRate(rateData.rate);
          setTempRate(rateData.rate.toString());
        }
      }
    } catch (err) {
      console.error('Error fetching POS data:', err);
      triggerToast('Error cargando catálogo o tasa', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProductsAndRate();
    }
  }, [isAuthenticated]);

  // Save exchange rate update
  const handleSaveRate = async () => {
    const num = parseFloat(tempRate);
    if (!num || isNaN(num) || num < 1) {
      triggerToast('Ingresa una tasa válida mayor a 0', true);
      return;
    }
    setExchangeRate(num);
    setIsEditingRate(false);

    try {
      await fetch('/api/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: num }),
      });
      triggerToast(`Tasa CUP actualizada a ${num}`);
    } catch (err) {
      console.error('Error saving exchange rate:', err);
    }
  };

  // Brand list for filter
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.marca && p.stock > 0) set.add(p.marca);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [products]);

  // Filtered products (only products with stock > 0)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.stock <= 0) return false;
      if (selectedBrand !== 'ALL' && p.marca.toUpperCase() !== selectedBrand.toUpperCase()) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchMarca = p.marca.toLowerCase().includes(q);
        const matchModelo = p.modelo.toLowerCase().includes(q);
        const matchCalidad = p.calidad.toLowerCase().includes(q);
        return matchMarca || matchModelo || matchCalidad;
      }
      return true;
    });
  }, [products, selectedBrand, searchTerm]);

  // Cart operations
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      triggerToast(`Sin stock para ${product.modelo}`, true);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          triggerToast(`Stock máximo alcanzado (${product.stock} uds)`, true);
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            marca: product.marca,
            modelo: product.modelo,
            calidad: product.calidad,
            qty: 1,
            precioUSD: product.precio,
            stockAvailable: product.stock,
          },
        ];
      }
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.qty + delta;
            if (newQty > item.stockAvailable) {
              triggerToast(`Stock disponible: ${item.stockAvailable} uds`, true);
              return item;
            }
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setClientName('');
    setNotes('');
  };

  // Calculations
  const subtotalUSD = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.precioUSD * item.qty, 0);
  }, [cart]);

  const totalUSD = subtotalUSD;
  const totalCUP = useMemo(() => {
    return subtotalUSD * exchangeRate;
  }, [subtotalUSD, exchangeRate]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.qty, 0);
  }, [cart]);

  // Print helper supporting Bluetooth, USB and System
  const executePrintTicket = async (orderData: any) => {
    const ticketData = {
      orderNumber: orderData.orderNumber,
      clientName: orderData.clientName,
      items: orderData.items,
      currency: orderData.currency,
      exchangeRate: orderData.exchangeRate,
      subtotalUSD: orderData.subtotalUSD,
      totalUSD: orderData.totalUSD,
      totalCUP: orderData.totalCUP,
      paid: orderData.paid,
      notes: orderData.notes,
      createdAt: orderData.createdAt,
    };

    if (printMode === 'bluetooth') {
      triggerToast('Buscando impresora Bluetooth...');
      const res = await printViaBluetooth(ticketData, copies);
      if (res.success) {
        triggerToast('¡Ticket impreso por Bluetooth exitosamente!');
      } else {
        triggerToast(res.error || 'Error en Bluetooth, usando ventana de impresión...', true);
        printTicket(ticketData, copies);
      }
    } else if (printMode === 'usb') {
      triggerToast('Conectando a puerto USB/Serial...');
      const res = await printViaUsb(ticketData, copies);
      if (res.success) {
        triggerToast('¡Ticket impreso por USB exitosamente!');
      } else {
        triggerToast(res.error || 'Error en USB, usando ventana de impresión...', true);
        printTicket(ticketData, copies);
      }
    } else {
      printTicket(ticketData, copies);
    }
  };

  // Submit Order
  const handleCheckout = async (autoPrint = false) => {
    if (cart.length === 0) {
      triggerToast('El carrito está vacío', true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        action: 'create',
        clientName,
        items: cart,
        currency,
        exchangeRate,
        paid: isPaid,
        notes,
      };

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        triggerToast(data.error || 'Error al procesar la venta', true);
        setIsSubmitting(false);
        return;
      }

      const orderData = data.sale;
      setCompletedOrder(orderData);
      triggerToast(`¡Venta #${orderData.orderNumber} registrada con éxito!`);

      // Refresh product stock list in background
      fetchProductsAndRate();

      // Print ticket if requested
      if (autoPrint) {
        setTimeout(() => {
          executePrintTicket(orderData);
        }, 200);
      }

      // Reset cart
      clearCart();
    } catch (err) {
      console.error('Error during checkout:', err);
      triggerToast('Error de conexión al procesar la venta', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 space-y-4 text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-extrabold text-white">Acceso Denegado</h1>
          <p className="text-sm text-gray-400">
            Debes iniciar sesión en el panel de administración primero.
          </p>
          <Link
            href="/admin"
            className="block px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-sm text-center shadow-gold-glow"
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

      {/* Hidden Ticket Container for direct printing */}
      <div style={{ display: 'none' }}>
        <TicketContent
          orderNumber={completedOrder?.orderNumber || 'PREVIEW'}
          clientName={clientName || completedOrder?.clientName || 'Consumidor Final'}
          items={cart.length > 0 ? cart.map(i => ({ ...i, subtotalUSD: i.precioUSD * i.qty })) : completedOrder?.items || []}
          currency={currency}
          exchangeRate={exchangeRate}
          subtotalUSD={subtotalUSD || completedOrder?.subtotalUSD || 0}
          totalUSD={totalUSD || completedOrder?.totalUSD || 0}
          totalCUP={totalCUP || completedOrder?.totalCUP || 0}
          paid={isPaid}
          notes={notes}
          createdAt={completedOrder?.createdAt || new Date()}
        />
      </div>

      {/* POS Top Navbar */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/20 backdrop-blur-xl bg-[#090A0F]/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-bold hidden sm:inline">Panel Admin</span>
            </Link>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl gold-gradient-bg p-[1px] flex items-center justify-center shadow-gold-glow">
                <div className="w-full h-full bg-[#10131E] rounded-[11px] flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-[#D4AF37]" />
                </div>
              </div>
              <div>
                <h1 className="text-base font-extrabold text-white leading-tight">
                  Punto de Venta <span className="gold-gradient-text">POS</span>
                </h1>
                <p className="text-[10px] text-gray-400">Control de Caja & Facturación</p>
              </div>
            </div>
          </div>

          {/* Quick links & Exchange rate pill */}
          <div className="flex items-center gap-2.5">
            {/* Exchange Rate Badge */}
            <div className="flex items-center bg-[#10131E] border border-[#D4AF37]/30 rounded-xl px-3 py-1.5 gap-2">
              <Banknote className="w-4 h-4 text-emerald-400" />
              {!isEditingRate ? (
                <div
                  onClick={() => setIsEditingRate(true)}
                  className="cursor-pointer flex items-center gap-1.5 text-xs"
                  title="Clic para modificar tasa CUP"
                >
                  <span className="text-gray-400 text-[11px]">1 USD =</span>
                  <span className="font-extrabold text-emerald-300 underline decoration-dotted">
                    {exchangeRate} CUP
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    className="w-16 px-1.5 py-0.5 bg-black/50 border border-emerald-500/50 rounded text-xs text-white text-center focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveRate}
                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-[10px] rounded"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>

            {/* Inventory Link */}
            <Link
              href="/admin/pos/inventario"
              className="px-3 py-2 rounded-xl bg-[#10131E] hover:bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1.5 transition-all"
            >
              <Boxes className="w-4 h-4 text-[#D4AF37]" />
              <span className="hidden sm:inline">Inventario</span>
            </Link>

            {/* Sales History Link */}
            <Link
              href="/admin/pos/historial"
              className="px-3 py-2 rounded-xl bg-[#10131E] hover:bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1.5 transition-all"
            >
              <History className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Historial</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main 2-Column POS Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection & Catalog (7 Cols) */}
        <section className="lg:col-span-7 space-y-4">
          {/* Search & Brand Filter */}
          <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por modelo, repuesto o calidad (ej. A55, InCell, Samsung)..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
              />
            </div>

            {/* Brand Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    selectedBrand === b
                      ? 'gold-gradient-bg text-black shadow-gold-glow'
                      : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {b === 'ALL' ? 'Todas las Marcas' : b}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-400 text-xs">Cargando inventario activo...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center space-y-2 border border-white/10">
              <Layers className="w-8 h-8 text-gray-500 mx-auto" />
              <p className="text-gray-300 font-bold text-sm">No se encontraron productos con stock</p>
              <p className="text-xs text-gray-500">
                Verifica la búsqueda o agrega más stock desde el módulo de Inventario.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filteredProducts.map((prod) => {
                const inCart = cart.find((c) => c.productId === prod.id);
                const availableAfterCart = prod.stock - (inCart ? inCart.qty : 0);

                return (
                  <div
                    key={prod.id}
                    className={`glass-card rounded-2xl p-4 border transition-all duration-200 flex flex-col justify-between ${
                      inCart
                        ? 'border-[#D4AF37]/50 bg-[#121626]'
                        : 'border-white/10 hover:border-white/20'
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

                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-gray-400 block">
                          Stock: <strong className="text-gray-200">{availableAfterCart}</strong>
                        </span>
                        <span className="text-base font-extrabold text-[#F3E0A9]">
                          ${prod.precio.toFixed(2)}{' '}
                          <span className="text-[10px] text-gray-400 font-normal">USD</span>
                        </span>
                      </div>

                      <button
                        onClick={() => addToCart(prod)}
                        disabled={availableAfterCart <= 0}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          availableAfterCart <= 0
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : 'gold-gradient-bg text-black shadow-gold-glow hover:scale-105 active:scale-95'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>{inCart ? `Agregar (${inCart.qty})` : 'Vender'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Active Cart & Checkout (5 Cols) */}
        <section className="lg:col-span-5">
          <div className="glass-panel rounded-3xl p-5 sm:p-6 border border-[#D4AF37]/30 shadow-2xl space-y-5 sticky top-24">
            {/* Cart Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#D4AF37]" />
                <h2 className="text-base font-bold text-white">Orden Actual</h2>
                <span className="px-2 py-0.5 rounded-full bg-[#E5C158]/20 text-[#E5C158] font-extrabold text-xs">
                  {totalItemsCount}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Vaciar
                </button>
              )}
            </div>

            {/* Cart Item List */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <ShoppingCart className="w-8 h-8 text-gray-600 mx-auto" />
                  <p className="text-xs text-gray-400">Selecciona repuestos para iniciar la venta</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3 rounded-xl bg-[#10131E] border border-white/5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-[#D4AF37] uppercase">{item.marca}</span>
                        <span className="text-[9px] text-gray-400">{item.calidad}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{item.modelo}</h4>
                      <span className="text-xs font-extrabold text-[#F3E0A9]">
                        ${(item.precioUSD * item.qty).toFixed(2)}{' '}
                        <span className="text-[10px] text-gray-500 font-normal">
                          (${item.precioUSD} c/u)
                        </span>
                      </span>
                    </div>

                    {/* Qty Controls */}
                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
                      <button
                        onClick={() => updateCartQty(item.productId, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-white">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateCartQty(item.productId, 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="text-gray-500 hover:text-rose-400 p-1"
                      title="Eliminar de la orden"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Customer & Payment Form */}
            <div className="space-y-3 pt-2 border-t border-white/10 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                  Nombre del Cliente (Opcional)
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ej. Taller Central / Juan Pérez"
                  className="w-full px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] transition-all"
                />
              </div>

              {/* Currency Selector & Paid Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                    Moneda de Pago
                  </label>
                  <div className="flex rounded-xl bg-[#10131E] p-1 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        currency === 'USD'
                          ? 'gold-gradient-bg text-black shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('CUP')}
                      className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        currency === 'CUP'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      CUP
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                    Estado de Pago
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPaid(!isPaid)}
                    className={`w-full py-2 px-3 rounded-xl font-bold text-xs border transition-all flex items-center justify-center gap-1.5 ${
                      isPaid
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isPaid ? 'Pagado' : 'Pendiente'}</span>
                  </button>
                </div>
              </div>

              {/* Notes / Internal Observations */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                  Observaciones / Notas Internas
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Garantía 7 días, entrega a domicilio..."
                  className="w-full px-3 py-2 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-[#D4AF37] transition-all"
                />
              </div>

              {/* Printer Mode Selector */}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                  Impresora Térmica
                </label>
                <div className="grid grid-cols-3 gap-1 bg-[#10131E] p-1 rounded-xl border border-white/10 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPrintMode('bluetooth')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      printMode === 'bluetooth'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Conectar por Bluetooth (ESC/POS)"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    <span>Bluetooth</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('usb')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      printMode === 'usb'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Conectar por cable USB / Serial"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span>USB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('system')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      printMode === 'system'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Imprimir usando ventana de navegador"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Sistema</span>
                  </button>
                </div>
              </div>

              {/* Ticket copies selector */}
              <div className="flex items-center justify-between text-gray-400 pt-1">
                <span className="text-[11px]">Copias de Ticket:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCopies(num)}
                      className={`w-6 h-6 rounded-lg text-xs font-bold ${
                        copies === num
                          ? 'bg-[#D4AF37] text-black'
                          : 'bg-[#10131E] text-gray-400 hover:text-white border border-white/10'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calculations Summary Box */}
            <div className="p-4 rounded-2xl bg-[#10131E] border border-[#D4AF37]/20 space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal USD:</span>
                <span className="font-bold text-white">${subtotalUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Tasa de Cambio:</span>
                <span className="font-semibold text-emerald-400">{exchangeRate} CUP</span>
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-between items-baseline">
                <span className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                  Total a Pagar:
                </span>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-[#F3E0A9]">
                    ${totalUSD.toFixed(2)} USD
                  </div>
                  <div className="text-xs font-bold text-emerald-400">
                    ≈ {totalCUP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CUP
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleCheckout(true)}
                disabled={cart.length === 0 || isSubmitting}
                className="w-full py-3.5 rounded-2xl gold-gradient-bg text-black font-extrabold text-sm shadow-gold-glow flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Printer className="w-4 h-4" />
                <span>{isSubmitting ? 'Procesando Venta...' : 'Vender & Imprimir Ticket'}</span>
              </button>

              <button
                onClick={() => handleCheckout(false)}
                disabled={cart.length === 0 || isSubmitting}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Solo Registrar Venta (Sin Imprimir)</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
