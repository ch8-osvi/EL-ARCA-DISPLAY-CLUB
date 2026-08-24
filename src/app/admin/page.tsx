'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AdminProductCard from '@/components/AdminProductCard';
import seedProducts from '@/data/products_seed.json';
import { Product } from '@/lib/types';
import * as XLSXStyle from 'xlsx-js-style';
import {
  Lock,
  KeyRound,
  ShieldAlert,
  RefreshCw,
  Plus,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Upload,
  Download,
  ShoppingCart,
  Boxes,
  History,
  EyeOff,
} from 'lucide-react';
import {
  getCanonicalBrand,
  getBrandCounts,
  sortProductsByPopularity,
} from '@/lib/brandUtils';

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
  const [newStock, setNewStock] = useState('1');

  // Excel Upload modal state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Trigger Toast Notification with custom duration
  const triggerToast = (msg: string, durationMs = 5000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
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

    const marcaTrimmed = (newMarca || 'VARIOS').toUpperCase().trim();
    const modeloTrimmed = newModelo.trim();

    // Check for duplicates (same brand, same model, same quality)
    const isDuplicate = products.some(
      (p) => 
        p.marca.toUpperCase() === marcaTrimmed &&
        p.modelo.toUpperCase() === modeloTrimmed.toUpperCase() &&
        p.calidad.toUpperCase() === finalCalidad
    );

    if (isDuplicate) {
      triggerToast('Error: Ya existe un display con la misma Marca, Modelo y Calidad.');
      return;
    }

    const newProd: Product = {
      id: `prod-custom-${Date.now()}`,
      marca: marcaTrimmed,
      modelo: modeloTrimmed,
      calidad: finalCalidad,
      precio: parseFloat(newPrecio) || 0,
      stock: Math.max(0, parseInt(newStock, 10) || 0),
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
    setNewStock('1');
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
        ws[`G${row + 1}`] = { v: Number(p.stock) || 0, t: 'n', s: DATA };
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

        // --- Strategy: read with header:1 (raw arrays) so we see EVERY row including brand headers ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawRows: any[][] = XLSXStyle.utils.sheet_to_json(sheet, { header: 1, defval: null });

        if (!rawRows || rawRows.length === 0) {
          triggerToast('El archivo Excel está vacío o no contiene hojas válidas.', 5000);
          setIsProcessingExcel(false);
          return;
        }

        // Helper: safe string clean (collapses whitespace/newlines)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleanStr = (val: any): string =>
          val != null ? String(val).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toNum = (val: any): number => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
          return 0;
        };

        // -----------------------------------------------------------------
        // Step 1: Find which row is the header row (has MARCA/MODELO/PRECIO)
        // and resolve column indices by NAME so we're independent of position.
        // -----------------------------------------------------------------
        let colMarca = 0;
        let colModelo = 1;
        let colCalidad = 2;
        let colPrecio = 3;
        let colStock = 6; // Column G default (UNIDADES)
        let headerRowIdx = -1;

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;
          let foundHeader = false;
          row.forEach((cell, idx) => {
            const s = cleanStr(cell).toUpperCase();
            if (s === 'MARCA') { colMarca = idx; foundHeader = true; }
            else if (s === 'MODELO') { colModelo = idx; foundHeader = true; }
            else if (s === 'CALIDAD') { colCalidad = idx; }
            // "PRECIO \nUSD" or "PRECIO USD" or just "PRECIO"
            else if (s.startsWith('PRECIO') || (s.includes('USD') && !s.includes('UNIDAD'))) { colPrecio = idx; }
            // "UNIDADES" or "STOCK" or "CANTIDAD"
            else if (s.includes('UNIDAD') || s.includes('STOCK') || s.includes('CANT')) { colStock = idx; }
          });
          if (foundHeader) { headerRowIdx = r; break; }
        }

        // -----------------------------------------------------------------
        // Step 2: Iterate ALL raw rows, skip the header row, parse products.
        // Brand section headers (e.g. row with MODELO="SAMSUNG" and no price)
        // are used to fill in the currentBrand for rows that lack MARCA.
        // -----------------------------------------------------------------
        const parsedProducts: Product[] = [];
        let currentBrand = 'VARIOS';
        let skippedNoPriceCount = 0;
        let zeroStockCount = 0;
        let withStockCount = 0;

        // Canonical brand names that can appear as section headers
        const BRAND_KEYWORDS = [
          'SAMSUNG', 'IPHONE', 'XIAOMI', 'REDMI', 'POCO',
          'MOTOROLA', 'HUAWEI', 'HONOR', 'INFINIX', 'TECNO', 'ITEL',
          'OPPO', 'REALME', 'NARZO', 'RENO', 'ZTE', 'NUBIA',
          'TCL', 'ALCATEL', 'LG', 'VIVO', 'BLACKVIEW', 'NOKIA',
        ];

        for (let i = 0; i < rawRows.length; i++) {
          if (i === headerRowIdx) continue; // skip header row itself

          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const rawMarca   = cleanStr(row[colMarca]);
          const rawModelo  = cleanStr(row[colModelo]);
          const rawCalidad = cleanStr(row[colCalidad]);
          const rawPrecio  = row[colPrecio];
          // Stock can be null when defval:null — that means blank cell
          const rawStock   = row[colStock];

          // Completely empty row → skip
          if (!rawMarca && !rawModelo) continue;

          // Detect brand-section header rows:
          // These have no price AND the modelo (or marca) contains only a brand name.
          const noPriceCell = (rawPrecio === null || rawPrecio === undefined || rawPrecio === '');
          const upperMod = rawModelo.toUpperCase();
          const upperMarca = rawMarca.toUpperCase();

          // Row is a brand header if: no price AND (modelo is a known brand keyword, or marca is set but modelo is empty)
          if (noPriceCell) {
            const isBrandHeader =
              (!rawModelo && rawMarca) ||
              BRAND_KEYWORDS.some(b => upperMod === b || (upperMod.length < 40 && upperMod.includes(b) && !rawCalidad));

            if (isBrandHeader) {
              currentBrand = (rawMarca || rawModelo).toUpperCase();
              continue;
            }
          }

          // Skip the repeated header row (MODELO/MARCA text as values)
          if (upperMod === 'MODELO' || upperMarca === 'MARCA') continue;

          // ------ PRICE ------
          const priceNum = toNum(rawPrecio);
          if (priceNum <= 0) {
            if (rawModelo) skippedNoPriceCount++; // only count real product rows
            continue;
          }

          // ------ STOCK ------
          let stockNum = 0;
          if (rawStock !== null && rawStock !== undefined && String(rawStock).trim() !== '') {
            const s = toNum(rawStock);
            stockNum = Math.max(0, Math.floor(s));
          }

          if (stockNum > 0) {
            withStockCount++;
          } else {
            zeroStockCount++;
          }

          const finalBrand = (rawMarca || currentBrand || 'VARIOS').toUpperCase();

          parsedProducts.push({
            id: `display-excel-${String(parsedProducts.length + 1).padStart(3, '0')}`,
            marca: finalBrand,
            modelo: rawModelo,
            calidad: (rawCalidad || 'ORIGINAL').toUpperCase(),
            precio: priceNum,
            stock: stockNum,
          });
        }

        if (parsedProducts.length === 0) {
          triggerToast(
            '⚠️ No se detectaron repuestos válidos en la hoja. Asegúrate de incluir las columnas: MARCA, MODELO, CALIDAD, PRECIO.',
            6000
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

        let summaryMsg = `✅ ¡Catálogo importado con ${parsedProducts.length} productos! (${withStockCount} con stock disponible, ${zeroStockCount} con stock 0).`;
        if (skippedNoPriceCount > 0) {
          summaryMsg += `\n⚠️ Se omitieron ${skippedNoPriceCount} filas por no tener precio.`;
        }
        triggerToast(summaryMsg, 8000);
        setShowExcelModal(false);
      } catch (err) {
        console.error('Error procesando Excel:', err);
        triggerToast('❌ Error al leer el archivo Excel. Revisa el formato e intenta nuevamente.', 6000);
      } finally {
        setIsProcessingExcel(false);
        e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Filtered list inside admin
  const filteredProducts = useMemo(() => {
    // 1. Filter
    let filtered = products;
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      filtered = products.filter(
        (p) =>
          p.marca.toLowerCase().includes(query) ||
          p.modelo.toLowerCase().includes(query) ||
          p.calidad.toLowerCase().includes(query)
      );
    }

    const brandCounts = getBrandCounts(products);
    return sortProductsByPopularity(filtered, brandCounts);
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Admin Header Banner */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
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

          {/* 4 Action Buttons - 2x2 grid, uniformly sized */}
          <div className="grid grid-cols-2 gap-3 w-full sm:w-[340px] shrink-0">
            {/* Upload Excel Button */}
            <button
              id="btn-open-excel-modal"
              onClick={() => setShowExcelModal(true)}
              className="h-11 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-sm w-full"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Cargar Excel</span>
            </button>

            {/* Export Excel Button */}
            <button
              id="btn-export-excel"
              onClick={handleExportExcel}
              className="h-11 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-sm w-full"
            >
              <Download className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Exportar Excel</span>
            </button>

            {/* Add product button */}
            <button
              id="btn-open-add-modal"
              onClick={() => setShowAddModal(true)}
              className="h-11 px-3 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow flex items-center justify-center gap-2 hover:scale-105 transition-all w-full"
            >
              <Plus className="w-4 h-4 text-black stroke-[3] shrink-0" />
              <span>Agregar Producto</span>
            </button>

            {/* Restore button */}
            <button
              id="btn-restore-excel"
              onClick={handleRestoreCatalog}
              className="h-11 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all hover:scale-105 w-full"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Restaurar Excel</span>
            </button>
          </div>
        </section>

        {/* Stats Metrics & POS Shortcuts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: POS Facturación */}
          <Link
            href="/admin/pos"
            className="glass-card rounded-2xl p-5 border border-[#D4AF37]/40 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#E5C158] uppercase">
                Punto de Venta POS
              </span>
              <ShoppingCart className="w-5 h-5 text-[#D4AF37] group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <span className="text-xl font-extrabold text-white block">
                Facturación & Caja
              </span>
              <span className="text-[11px] text-[#E5C158] font-semibold mt-0.5 block">
                Abrir Terminal de Ventas →
              </span>
            </div>
          </Link>

          {/* Card 2: Historial de Ventas */}
          <Link
            href="/admin/pos/historial"
            className="glass-card rounded-2xl p-5 border border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/10 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase">
                Historial & Caja
              </span>
              <History className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <span className="text-xl font-extrabold text-white block">
                Ventas Realizadas
              </span>
              <span className="text-[11px] text-blue-300 font-semibold mt-0.5 block">
                Cuadre & Reimpresión →
              </span>
            </div>
          </Link>

          {/* Card 3: Control de Inventario */}
          <Link
            href="/admin/pos/inventario"
            className="glass-card rounded-2xl p-5 border border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase">
                Control de Inventario
              </span>
              <Boxes className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <span className="text-xl font-extrabold text-white block">
                Stock & Entradas
              </span>
              <span className="text-[11px] text-emerald-300 font-semibold mt-0.5 block">
                Ajustar / Ver Auditoría →
              </span>
            </div>
          </Link>

          {/* Card 4: Productos Ocultos */}
          <Link
            href="/admin/ocultos"
            className="glass-card rounded-2xl p-5 border border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-500/10 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 uppercase">
                Productos Ocultos
              </span>
              <EyeOff className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-white block">
                  Agotados ({deletedCount})
                </span>
              </div>
              <span className="text-[11px] text-rose-300 font-semibold mt-0.5 block">
                Ver todos / Reactivar →
              </span>
            </div>
          </Link>
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Calidad del Display
                  </label>
                  <select
                    value={newCalidadSelect}
                    onChange={(e) => setNewCalidadSelect(e.target.value)}
                    className="w-full px-3 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-xs focus:border-[#D4AF37] focus:outline-none cursor-pointer"
                  >
                    <option value="ORIGINAL C/M">ORIGINAL C/M (Con Marco)</option>
                    <option value="INCELL C/M">INCELL C/M (Con Marco)</option>
                    <option value="OLED C/M">OLED C/M (Con Marco)</option>
                    <option value="ORIGINAL">ORIGINAL S/M (Sin Marco)</option>
                    <option value="INCELL">INCELL S/M (Sin Marco)</option>
                    <option value="OLED">OLED S/M (Sin Marco)</option>
                    <option value="OLED SOFT">OLED SOFT (Gama Alta)</option>
                    <option value="AMOLED C/M">AMOLED C/M</option>
                    <option value="MECHANIC">MECHANIC (Especial)</option>
                    <option value="AAA">AAA</option>
                    <option value="CUSTOM">-- Personalizada --</option>
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
                    className="w-full px-3 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-xs focus:border-[#D4AF37] focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-emerald-400 block mb-1">
                    Stock Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    placeholder="ej. 5"
                    className="w-full px-3 py-3 bg-[#10131E] border border-emerald-500/30 rounded-xl text-white text-xs focus:border-emerald-400 focus:outline-none font-bold"
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

      {/* Toast Notification Banner - Always on top (z-[100]) */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-[100] glass-panel px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 border max-w-lg transition-all duration-300 ${
            toastMessage.toLowerCase().includes('error') || toastMessage.includes('❌')
              ? 'border-rose-500/60 bg-[#1A1118] text-rose-200 shadow-rose-950/50'
              : toastMessage.includes('⚠️')
              ? 'border-amber-500/60 bg-[#1A1512] text-amber-200 shadow-amber-950/50'
              : 'border-[#D4AF37]/40 bg-[#121522] text-white shadow-gold-glow'
          }`}
        >
          {toastMessage.toLowerCase().includes('error') || toastMessage.includes('❌') ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : toastMessage.includes('⚠️') ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="text-xs font-semibold leading-relaxed whitespace-pre-line flex-1">
            {toastMessage}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-gray-400 hover:text-white shrink-0 -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
