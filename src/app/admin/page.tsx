'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from '../../components/Navbar';
import AdminProductCard from '../../components/AdminProductCard';
import seedProducts from '../../data/products_seed.json';
import { Product } from '../../lib/types';
import * as XLSXStyle from 'xlsx-js-style';
import {
  Lock,
  KeyRound,
  ShieldAlert,
  RefreshCw,
  PlusCircle,
  Search,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Upload,
  Download,
} from 'lucide-react';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New product form modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMarca, setNewMarca] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [newCalidadSelect, setNewCalidadSelect] = useState('ORIGINAL C/M');
  const [newCalidadCustom, setNewCalidadCustom] = useState('');
  const [newPrecio, setNewPrecio] = useState('');

  // Excel Upload modal state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check login session
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch product list
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products);
          setDeletedCount(data.deletedCount || 0);
          localStorage.setItem('el_arca_products', JSON.stringify(data.products));
          localStorage.setItem('el_arca_deleted', (data.deletedCount || 0).toString());
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('API error in admin, using localStorage fallback');
    }

    const local = localStorage.getItem('el_arca_products');
    const localDeleted = localStorage.getItem('el_arca_deleted');
    if (localDeleted) {
      setDeletedCount(parseInt(localDeleted) || 0);
    }
    if (local) {
      try {
        setProducts(JSON.parse(local));
      } catch {
        setProducts(seedProducts as Product[]);
      }
    } else {
      setProducts(seedProducts as Product[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
    }
  }, [isAuthenticated]);

  // Handle Login Submit
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'arca2026' || passwordInput === 'admin') {
      setIsAuthenticated(true);
      sessionStorage.setItem('el_arca_admin_auth', 'true');
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('el_arca_admin_auth');
  };

  // Trigger Toast Notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Delete product globally & locally
  const handleDeleteProduct = async (id: string) => {
    const updated = products.filter((p) => p.id !== id);
    setProducts(updated);
    const newDeleted = deletedCount + 1;
    setDeletedCount(newDeleted);
    localStorage.setItem('el_arca_products', JSON.stringify(updated));
    localStorage.setItem('el_arca_deleted', newDeleted.toString());

    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      triggerToast('Producto eliminado del catálogo global en Vercel');
    } catch (err) {
      triggerToast('Producto eliminado en modo local');
    }
  };

  // Restore Catalog
  const handleRestoreCatalog = async () => {
    if (
      !confirm(
        '¿Deseas restaurar la lista completa de 163 repuestos originales del Excel?'
      )
    ) {
      return;
    }

    const original = seedProducts as Product[];
    setProducts(original);
    setDeletedCount(0);
    localStorage.setItem('el_arca_products', JSON.stringify(original));
    localStorage.setItem('el_arca_deleted', '0');

    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      triggerToast('Catálogo restaurado a los 163 productos del Excel');
    } catch {
      triggerToast('Catálogo restaurado localmente');
    }
  };

  // Add New Single Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelo || !newPrecio) return;

    const finalCalidad =
      newCalidadSelect === 'CUSTOM'
        ? newCalidadCustom.trim().toUpperCase() || 'ORIGINAL C/M'
        : newCalidadSelect.trim().toUpperCase();

    const newProd: Product = {
      id: `prod-custom-${Date.now()}`,
      marca: (newMarca || 'VARIOS').toUpperCase().trim(),
      modelo: newModelo.trim(),
      calidad: finalCalidad,
      precio: parseFloat(newPrecio) || 0,
      stock: 1,
    };

    const updated = [newProd, ...products];
    setProducts(updated);
    localStorage.setItem('el_arca_products', JSON.stringify(updated));

    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', product: newProd }),
      });
      triggerToast('Nuevo producto agregado con éxito');
    } catch {
      triggerToast('Producto agregado localmente');
    }

    setNewMarca('');
    setNewModelo('');
    setNewCalidadSelect('ORIGINAL C/M');
    setNewCalidadCustom('');
    setNewPrecio('');
    setShowAddModal(false);
  };

  // Export current product list to Excel — with full professional styling
  const handleExportExcel = () => {
    if (products.length === 0) {
      triggerToast('No hay productos para exportar');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (style: any) => style;

    const BRAND_HEADER = s({
      font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' }, name: 'Arial' },
      fill: { patternType: 'solid', fgColor: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    const COL_HDR = s({
      font: { bold: true, sz: 11, color: { rgb: '000000' }, name: 'Arial' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });

    const PRICE_HDR = s({
      font: { bold: true, sz: 11, color: { rgb: '5B9BD5' }, name: 'Arial' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });

    const DATA = s({
      font: { sz: 11, color: { rgb: '000000' }, name: 'Arial' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });

    const PRICE_DATA = s({
      font: { bold: true, sz: 11, color: { rgb: '5B9BD5' }, name: 'Arial' },
      alignment: { horizontal: 'center', vertical: 'center' },
      numFmt: '$#,##0.00',
    });

    const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ws: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merges: any[] = [];

    const getCanonicalBrand = (brand: string): string => {
      const b = brand.toUpperCase().trim();
      if (!b) return 'OTROS';
      if (b.includes('SAMSUNG')) return 'SAMSUNG';
      if (b.includes('IPHONE') || b.includes('APPLE')) return 'IPHONE';
      if (b.includes('MOTOROLA')) return 'MOTOROLA';
      if (b.includes('XIAOMI') || b.includes('REDMI') || b.includes('POCO')) return 'XIAOMI';
      if (b.includes('HUAWEI') || b.includes('HONOR') || b.includes('NOVA')) return 'HUAWEI / HONOR / NOVA';
      if (b.includes('INFINIX') || b.includes('TECNO') || b.includes('ITEL')) return 'INFINIX / TECNO / ITEL';
      if (b.includes('OPPO') || b.includes('REALME') || b.includes('RENO') || b.includes('ONEPLUS') || b.includes('ONE PLUS') || b.includes('NARZO')) return 'OPPO / REALME / RENO / ONEPLUS';
      if (b.includes('ZTE') || b.includes('NUBIA')) return 'ZTE / NUBIA';
      if (b.includes('TCL') || b.includes('ALCATEL')) return 'TCL / ALCATEL';
      if (b.includes('LG')) return 'LG';
      if (b.includes('VIVO')) return 'VIVO';
      if (b.includes('BLACKVIEW')) return 'BLACKVIEW';
      if (b.includes('NOKIA')) return 'NOKIA';
      return b;
    };

    const grouped = new Map<string, typeof products>();
    products.forEach((p) => {
      const brand = getCanonicalBrand(p.marca);
      if (!grouped.has(brand)) grouped.set(brand, []);
      grouped.get(brand)!.push(p);
    });
    // Sort brands by the number of products they have (highest first)
    const sortedBrands = Array.from(grouped.keys()).sort((a, b) => {
      return grouped.get(b)!.length - grouped.get(a)!.length;
    });

    let row = 0;

    // Header row
    const headers = ['MARCA', 'MODELO', 'CALIDAD', 'PRECIO \nUSD', '', '', 'UNIDADES'];
    headers.forEach((h, ci) => {
      ws[`${COLS[ci]}${row + 1}`] = {
        v: h,
        t: 's',
        s: ci === 3 ? PRICE_HDR : COL_HDR,
      };
    });
    row++;

    const getCalidadStyle = (calidad: string) => {
      const c = calidad.toUpperCase().trim();
      const baseFont = { sz: 11, name: 'Arial' };
      const baseAlign = { horizontal: 'center', vertical: 'center', wrapText: true };
      
      if (c === 'ORIGINAL C/M' || c === 'INCELL C/M' || c === 'OLED C/M') {
        return s({ font: { ...baseFont, bold: true, color: { rgb: '000000' } }, alignment: baseAlign });
      }
      if (c.includes('AMOLED C/M') || c.includes('OLED SOFT')) {
        return s({ font: { ...baseFont, bold: true, color: { rgb: '8A2BE2' } }, alignment: baseAlign }); // Violet
      }
      if (c.includes('MECHANIC')) {
        return s({ font: { ...baseFont, bold: true, color: { rgb: 'FF0000' } }, alignment: baseAlign }); // Red
      }
      return DATA;
    };

    sortedBrands.forEach((brand) => {
      const items = grouped.get(brand)!;

      // Brand header row (black background)
      ws[`A${row + 1}`] = { v: '', t: 's', s: BRAND_HEADER };
      ws[`B${row + 1}`] = { v: brand, t: 's', s: BRAND_HEADER };
      for (let c = 2; c < 7; c++) {
        ws[`${COLS[c]}${row + 1}`] = { v: '', t: 's', s: BRAND_HEADER };
      }
      merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 3 } });
      row++;

      // Data rows
      items.forEach((p) => {
        ws[`A${row + 1}`] = { v: p.marca, t: 's', s: DATA };
        ws[`B${row + 1}`] = { v: p.modelo, t: 's', s: DATA };
        ws[`C${row + 1}`] = { v: p.calidad, t: 's', s: getCalidadStyle(p.calidad) };
        ws[`D${row + 1}`] = { v: p.precio, t: 'n', s: PRICE_DATA };
        ws[`E${row + 1}`] = { v: '', t: 's', s: DATA };
        ws[`F${row + 1}`] = { v: '', t: 's', s: DATA };
        ws[`G${row + 1}`] = { v: p.stock, t: 'n', s: DATA };
        row++;
      });
    });

    ws['!ref'] = `A1:G${row}`;
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 15 }, // A: MARCA
      { wch: 45 }, // B: MODELO
      { wch: 20 }, // C: CALIDAD
      { wch: 15 }, // D: PRECIO USD
      { wch: 5 },  // E
      { wch: 5 },  // F
      { wch: 12 }, // G: UNIDADES
    ];
    // No ws['!rows'] so Excel auto-fits the row heights for multi-line wrapped text

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, 'DISPLAYS');
    const fileName = `EL_ARCA_DISPLAY_CLUB_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSXStyle.writeFile(wb, fileName);
    triggerToast(`Catálogo exportado con formato: ${fileName}`);
  };

  // Handle Uploading and Parsing New Excel File directly in the browser

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsProcessingExcel(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSXStyle.read(bstr, { type: 'array' });

        // Find sheet 'DISPLAYS' or default to first sheet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sheetName = wb.SheetNames.find((s: any) => String(s).toUpperCase() === 'DISPLAYS');
        if (!sheetName) sheetName = wb.SheetNames[0];

        const sheet = wb.Sheets[sheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawData: any[] = XLSXStyle.utils.sheet_to_json(sheet, { header: 1 });

        if (!rawData || rawData.length === 0) {
          alert('El archivo Excel está vacío o no contiene hojas válidas.');
          setIsProcessingExcel(false);
          return;
        }

        const parsedProducts: Product[] = [];

        // Helper text cleanup
        const cleanStr = (val: any) =>
          val ? String(val).replace(/\n/g, ' ').trim() : '';

        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;

          const rawMarca = cleanStr(row[0]);
          const rawModelo = cleanStr(row[1]);
          const rawCalidad = cleanStr(row[2]);
          const rawPrecio = row[3];

          if (!rawModelo || rawModelo.toUpperCase() === 'MODELO') continue;

          let priceNum = 0;
          if (typeof rawPrecio === 'number') {
            priceNum = rawPrecio;
          } else if (typeof rawPrecio === 'string') {
            priceNum = parseFloat(rawPrecio.replace(/[^0-9.]/g, '')) || 0;
          }

          if (priceNum <= 0) continue;

          parsedProducts.push({
            id: `display-excel-${String(parsedProducts.length + 1).padStart(3, '0')}`,
            marca: (rawMarca || 'VARIOS').toUpperCase(),
            modelo: rawModelo,
            calidad: (rawCalidad || 'ORIGINAL').toUpperCase(),
            precio: priceNum,
            stock: 1,
          });
        }

        if (parsedProducts.length === 0) {
          alert(
            'No se detectaron repuestos válidos en la hoja. Asegúrate de incluir las columnas: MARCA, MODELO, CALIDAD, PRECIO.'
          );
          setIsProcessingExcel(false);
          return;
        }

        // Update Products globally and locally
        setProducts(parsedProducts);
        setDeletedCount(0);
        localStorage.setItem('el_arca_products', JSON.stringify(parsedProducts));
        localStorage.setItem('el_arca_deleted', '0');

        try {
          await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync', initialList: parsedProducts }),
          });
        } catch {
          console.warn('Sync server call failed, saved locally');
        }

        triggerToast(
          `¡Éxito! Catálogo actualizado con ${parsedProducts.length} modelos desde tu nuevo Excel`
        );
        setShowExcelModal(false);
      } catch (err) {
        console.error('Error procesando Excel:', err);
        alert('Error al leer el archivo Excel. Revisa el formato e intenta nuevamente.');
      } finally {
        setIsProcessingExcel(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Filtered list inside admin
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const query = searchTerm.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.marca.toLowerCase().includes(query) ||
        p.modelo.toLowerCase().includes(query) ||
        p.calidad.toLowerCase().includes(query)
    );
  }, [products, searchTerm]);

  // Login Screen Render
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-[#D4AF37]/30 shadow-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E5C158] to-[#AA8826] p-[1px] shadow-gold-glow mx-auto flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Acceso Administrativo
            </h1>
            <p className="text-xs text-gray-400">
              Prototipo de Gestión - EL ARCA DISPLAY CLUB
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 block">
                Contraseña de Acceso
              </label>
              <div className="relative">
                <input
                  id="input-admin-password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Ingresa la clave de acceso"
                  className="w-full pl-10 pr-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] transition-all"
                  required
                />
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Contraseña incorrecta. Inténtalo nuevamente.</span>
              </div>
            )}

            <button
              id="btn-admin-login"
              type="submit"
              className="w-full py-3.5 rounded-xl gold-gradient-bg text-black font-extrabold text-sm shadow-gold-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Ingresar al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col">
      <Navbar
        isAdmin={true}
        onLogout={handleLogout}
        onRestoreCatalog={handleRestoreCatalog}
        totalProducts={products.length}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 glass-panel border border-[#D4AF37]/40 bg-[#121522] px-5 py-3.5 rounded-2xl shadow-gold-glow flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-bold text-white">{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Admin Header Banner */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold text-amber-300">
              <Lock className="w-3.5 h-3.5" />
              Panel Administrativo Activo
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Gestión de Catálogo en Vivo
            </h1>
            <p className="text-xs sm:text-sm text-gray-300">
              Puedes subir un nuevo Excel (.xlsx), agregar productos manualmente o borrar los existentes en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Upload Excel Button */}
            <button
              id="btn-open-excel-modal"
              onClick={() => setShowExcelModal(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-2 transition-all hover:scale-105"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Cargar Nuevo Excel</span>
            </button>

            {/* Export Excel Button */}
            <button
              id="btn-export-excel"
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold text-xs flex items-center gap-2 transition-all hover:scale-105"
            >
              <Download className="w-4 h-4 text-blue-400" />
              <span>Exportar Excel</span>
            </button>

            {/* Add product button */}
            <button
              id="btn-open-add-modal"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow flex items-center gap-2 hover:scale-105 transition-all"
            >
              <PlusCircle className="w-4 h-4 fill-black" />
              <span>Agregar Producto</span>
            </button>

            {/* Restore button */}
            <button
              id="btn-restore-excel"
              onClick={handleRestoreCatalog}
              className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-2 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restaurar Excel</span>
            </button>
          </div>
        </section>

        {/* Stats Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <span className="text-xs font-semibold text-gray-400 block uppercase">
              Total Repuestos Activos
            </span>
            <span className="text-3xl font-extrabold text-white mt-1 block">
              {products.length}
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <span className="text-xs font-semibold text-gray-400 block uppercase">
              Semilla Inicial Excel
            </span>
            <span className="text-3xl font-extrabold text-[#D4AF37] mt-1 block">
              163
            </span>
          </div>

          <a
            href="/admin/ocultos"
            className="glass-card rounded-2xl p-5 border border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/5 transition-all duration-200 cursor-pointer group"
          >
            <span className="text-xs font-semibold text-gray-400 block uppercase">
              Productos Ocultos / Eliminados
            </span>
            <span className="text-3xl font-extrabold text-rose-400 mt-1 block">
              {deletedCount}
            </span>
            <span className="text-[10px] text-rose-400/60 group-hover:text-rose-400 transition-colors mt-1 block font-semibold">
              Ver todos →
            </span>
          </a>
        </div>

        {/* Search filter for Admin */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <input
            id="input-admin-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar repuesto para eliminar o revisar..."
            className="w-full pl-11 pr-10 py-3.5 bg-[#10131E] border border-[#D4AF37]/30 rounded-2xl text-white placeholder-gray-400 text-sm focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        {/* Admin Products List */}
        {loading ? (
          <div className="py-20 text-center text-gray-400">Cargando catálogo admin...</div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <AdminProductCard
                key={product.id}
                product={product}
                onDelete={handleDeleteProduct}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400 glass-panel rounded-2xl border border-white/10">
            No hay productos que coincidan con la búsqueda.
          </div>
        )}
      </main>

      {/* Upload Excel Modal */}
      {showExcelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-3xl p-6 sm:p-8 border border-emerald-500/40 shadow-2xl relative space-y-6">
            <button
              onClick={() => setShowExcelModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Actualizar Catálogo desde Excel</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Selecciona tu archivo de Excel (ej. <strong className="text-emerald-300">EL ARCA DISPLAY CLUB.xlsx</strong>). El sistema leerá automáticamente la hoja <strong>DISPLAYS</strong> y actualizará todos los modelos para tus clientes al instante.
              </p>
            </div>

            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 rounded-2xl p-8 text-center cursor-pointer bg-emerald-950/10 hover:bg-emerald-950/20 transition-all space-y-3"
              >
                <Upload className="w-10 h-10 text-emerald-400 mx-auto animate-pulse" />
                <div>
                  <span className="text-sm font-bold text-white block">
                    Haz clic aquí para seleccionar tu archivo Excel (.xlsx)
                  </span>
                  <span className="text-xs text-gray-400">
                    Soporta archivos .xlsx con las columnas MARCA, MODELO, CALIDAD, PRECIO
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {isProcessingExcel && (
                <div className="text-center py-2 text-xs font-bold text-emerald-400 animate-pulse">
                  Procesando hoja de cálculo y actualizando catálogo...
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowExcelModal(false)}
                  className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Single Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/40 shadow-2xl relative space-y-6">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Agregar Nuevo Display</h3>
              <p className="text-xs text-gray-400">
                Añade un repuesto individual al catálogo público en tiempo real.
              </p>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Marca
                </label>
                <input
                  type="text"
                  value={newMarca}
                  onChange={(e) => setNewMarca(e.target.value)}
                  placeholder="ej. SAMSUNG, iPHONE, XIAOMI"
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Modelo / Código
                </label>
                <input
                  type="text"
                  value={newModelo}
                  onChange={(e) => setNewModelo(e.target.value)}
                  placeholder="ej. Galaxy A55 5G / A556"
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Calidad del Display
                  </label>
                  <select
                    value={newCalidadSelect}
                    onChange={(e) => setNewCalidadSelect(e.target.value)}
                    className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none cursor-pointer"
                  >
                    <option value="ORIGINAL C/M">ORIGINAL C/M (Con Marco)</option>
                    <option value="INCELL C/M">INCELL C/M (Con Marco)</option>
                    <option value="OLED C/M">OLED C/M (Con Marco)</option>
                    <option value="ORIGINAL">ORIGINAL (Sin Marco)</option>
                    <option value="INCELL">INCELL (Sin Marco)</option>
                    <option value="OLED">OLED (Sin Marco)</option>
                    <option value="OLED MECHANIC">OLED MECHANIC</option>
                    <option value="AAA">AAA</option>
                    <option value="CUSTOM">-- Escribir Calidad Personalizada --</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Precio ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPrecio}
                    onChange={(e) => setNewPrecio(e.target.value)}
                    placeholder="ej. 18.00"
                    className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {newCalidadSelect === 'CUSTOM' && (
                <div>
                  <label className="text-xs font-semibold text-amber-300 block mb-1">
                    Escribe la calidad personalizada (ej. ORIGINAL C/M ESPECIAL):
                  </label>
                  <input
                    type="text"
                    value={newCalidadCustom}
                    onChange={(e) => setNewCalidadCustom(e.target.value)}
                    placeholder="ej. ORIGINAL CON MARCO C/M"
                    className="w-full px-4 py-3 bg-[#10131E] border border-amber-500/40 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none"
                    required
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl gold-gradient-bg text-black text-xs font-extrabold shadow-gold-glow"
                >
                  Guardar Display
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
