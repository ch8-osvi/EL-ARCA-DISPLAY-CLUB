"use client";
import RouteLoading from "./loading";
import {
  productCategory,
  CATEGORIES,
  type ProductCategory,
} from "@/lib/categories";
import BrandFilter from "@/components/BrandFilter";
import CategoryFilter from "@/components/CategoryFilter";
import { parseCatalogNumber } from "@/lib/catalogNumbers";
import { checkAdminSession, loginAdmin } from "@/lib/auth-client";

import { useActiveExchangeRate } from "@/lib/useActiveExchangeRate";
import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AdminProductCard from "@/components/AdminProductCard";
import { Product } from "@/lib/types";
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
  Sparkles,
  GitMerge,
  Tag,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getCanonicalBrand,
  getBrandCounts,
  getSortedBrands,
  matchBrandFilter,
  sortProductsByPopularity,
} from "@/lib/brandUtils";
import { fuzzyMatchProduct } from "@/lib/searchUtils";

const SkeletonProductCard = () => (
  <div className="glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden animate-pulse">
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="h-6 w-16 bg-white/10 rounded-lg"></div>
        <div className="h-5 w-20 bg-white/10 rounded-full"></div>
      </div>
      <div className="h-6 w-3/4 bg-white/10 rounded-lg mt-4"></div>
      <div className="h-4 w-1/2 bg-white/10 rounded-lg mt-2"></div>
    </div>
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 w-12 bg-white/10 rounded"></div>
        <div className="h-4 w-10 bg-white/10 rounded"></div>
      </div>
      <div className="pt-3 border-t border-white/5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-6 w-16 bg-white/10 rounded-lg"></div>
          <div className="h-5 w-20 bg-white/10 rounded-lg"></div>
        </div>
        <div className="h-8 w-20 ml-auto bg-white/10 rounded-xl"></div>
      </div>
    </div>
  </div>
);

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [deletedCount, setDeletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    ProductCategory | "ALL"
  >("ALL");
  const [newCategory, setNewCategory] = useState<ProductCategory>("DISPLAY");
  const [savingProduct, setSavingProduct] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ElTOQUE Rate logic
  const [currentRate, setCurrentRate] = useActiveExchangeRate();
  const [eltoqueRate, setEltoqueRate] = useState<number | null>(null);
  const [referenceStatus, setReferenceStatus] = useState(
    "Verificando referencia elTOQUE…",
  );
  const [referenceStale, setReferenceStale] = useState(true);
  const [savingRate, setSavingRate] = useState(false);
  const [loadingRates, setLoadingRates] = useState(true);
  const [isEltoqueMinimized, setIsEltoqueMinimized] = useState(false);

  // New product form modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMarca, setNewMarca] = useState("");
  const [newModelo, setNewModelo] = useState("");
  const [newCalidadSelect, setNewCalidadSelect] = useState("ORIGINAL C/M");
  const [newCalidadCustom, setNewCalidadCustom] = useState("");
  const [newPrecio, setNewPrecio] = useState("");
  const [newStock, setNewStock] = useState("1");

  // Excel Upload modal state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check login session
  useEffect(() => {
    void checkAdminSession().then((value) => {
      setIsAuthenticated(value);
      setCheckingSession(false);
    });
  }, []);

  // Fetch product list
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products);
          setDeletedCount(data.deletedCount || 0);
          localStorage.setItem(
            "el_arca_products",
            JSON.stringify(data.products),
          );
          localStorage.setItem(
            "el_arca_deleted",
            (data.deletedCount || 0).toString(),
          );
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn("API error in admin, using localStorage fallback");
    }

    const local = localStorage.getItem("el_arca_products");
    const localDeleted = localStorage.getItem("el_arca_deleted");
    if (localDeleted) {
      setDeletedCount(parseInt(localDeleted) || 0);
    }
    if (local) {
      try {
        setProducts(JSON.parse(local));
      } catch {
        setProducts([]);
      }
    } else {
      setProducts([]);
    }
    setLoading(false);
    triggerToast(
      "No pudimos verificar el catálogo. Los datos guardados pueden estar desactualizados.",
    );
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();

      const savedMin = localStorage.getItem("el_arca_eltoque_minimized");
      if (savedMin === "true") {
        setIsEltoqueMinimized(true);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/eltoque", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        setEltoqueRate(data.success ? data.rate : null);
        setReferenceStale(!data.success || data.stale);
        setReferenceStatus(
          data.success
            ? [
                data.stale
                  ? "Referencia desactualizada."
                  : "Referencia elTOQUE (últimas 24 horas).",
                "Verificada: " + new Date(data.updatedAt).toLocaleString(),
                "Fecha informada por elTOQUE: " + data.providerDate,
                data.warning || "",
              ]
                .filter(Boolean)
                .join(" ")
            : "Referencia elTOQUE no disponible. Se mantiene la tasa activa del negocio.",
        );
      } catch {
        if (active) {
          setReferenceStale(true);
          setReferenceStatus(
            "No se pudo verificar elTOQUE. Se mantiene la tasa activa del negocio.",
          );
        }
      } finally {
        if (active) setLoadingRates(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [isAuthenticated]);

  const handleAjustarTasa = async () => {
    if (!eltoqueRate || referenceStale || savingRate) return;
    setSavingRate(true);
    try {
      const response = await fetch("/api/exchange-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: eltoqueRate, source: "eltoque" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "No se pudo guardar la tasa");
      setCurrentRate(data.rate);
      window.dispatchEvent(new Event("exchange-rate-changed"));
      try {
        localStorage.setItem("el_arca_rate_updated", String(Date.now()));
      } catch {}
      triggerToast("Tasa del negocio guardada: " + data.rate + " CUP");
    } catch (error) {
      triggerToast(
        error instanceof Error ? error.message : "Error ajustando la tasa",
        3000,
      );
    } finally {
      setSavingRate(false);
    }
  };

  // Handle Login Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await loginAdmin(passwordInput)) {
      setIsAuthenticated(true);

      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setIsAuthenticated(false);

    window.location.href = "/";
  };

  // Trigger Toast Notification with custom duration
  const triggerToast = (msg: string, durationMs = 5000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
  };

  // Render mutations only after the server has committed them.
  const mutateCatalog = async (body: unknown) => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.error || "No se guardó la operación");
    if (Array.isArray(data.products)) {
      setProducts(data.products);
      setDeletedCount(data.deletedCount || 0);
      try {
        localStorage.setItem("el_arca_products", JSON.stringify(data.products));
        localStorage.setItem("el_arca_deleted", String(data.deletedCount || 0));
      } catch {
        /* Storage is optional. */
      }
    }
    return data;
  };
  const handleDeleteProduct = async (id: string) => {
    try {
      await mutateCatalog({ action: "delete", id });
      triggerToast("Producto archivado correctamente");
      return true;
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "No se pudo archivar");
      return false;
    }
  };
  const handleRestoreCatalog = async () => {
    if (
      !confirm(
        "¿Restaurar el catálogo inicial? Esta opción solo está disponible cuando no hay ventas ni movimientos de inventario.",
      )
    )
      return;
    try {
      await mutateCatalog({ action: "restore" });
      triggerToast("Catálogo inicial restaurado");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  };
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProduct) return;
    const calidad =
      newCalidadSelect === "CUSTOM"
        ? newCalidadCustom.trim().toUpperCase()
        : newCalidadSelect;
    if (
      !newModelo.trim() ||
      !calidad ||
      !Number.isSafeInteger(Number(newStock)) ||
      Number(newStock) < 0
    ) {
      triggerToast("Revisa el modelo, la calidad y el stock entero (mínimo 0)");
      return;
    }
    setSavingProduct(true);
    try {
      const data = await mutateCatalog({
        action: "add",
        product: {
          categoria: newCategory,
          marca: (newMarca || "VARIOS").trim().toUpperCase(),
          modelo: newModelo.trim().toUpperCase(),
          calidad,
          precio: Number(newPrecio),
          stock: Number(newStock),
        },
      });
      triggerToast(data.message || "Producto guardado");
      setNewMarca("");
      setNewModelo("");
      setNewCalidadCustom("");
      setNewPrecio("");
      setNewStock("1");
      setShowAddModal(false);
    } catch (err) {
      triggerToast(
        err instanceof Error ? err.message : "No se guardó el producto",
      );
    } finally {
      setSavingProduct(false);
    }
  };

  // Export current product list to Excel — with full professional styling
  const handleExportExcel = async () => {
    try {
      const XLSXStyle = await import("xlsx-js-style");
      if (products.length === 0) {
        triggerToast("No hay productos para exportar");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (style: any) => style;

      const BRAND_HEADER = s({
        font: { bold: true, sz: 12, color: { rgb: "FFFFFF" }, name: "Arial" },
        fill: { patternType: "solid", fgColor: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
      });

      const COL_HDR = s({
        font: { bold: true, sz: 11, color: { rgb: "000000" }, name: "Arial" },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });

      const PRICE_HDR = s({
        font: { bold: true, sz: 11, color: { rgb: "5B9BD5" }, name: "Arial" },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });

      const DATA = s({
        font: { sz: 11, color: { rgb: "000000" }, name: "Arial" },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      });

      const PRICE_DATA = s({
        font: { bold: true, sz: 11, color: { rgb: "5B9BD5" }, name: "Arial" },
        alignment: { horizontal: "center", vertical: "center" },
        numFmt: "$#,##0.00",
      });

      const COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
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
      const headers = [
        "MARCA",
        "MODELO",
        "CALIDAD",
        "PRECIO \nUSD",
        "",
        "",
        "UNIDADES",
        "CATEGORIA",
        "ID",
      ];
      headers.forEach((h, ci) => {
        ws[`${COLS[ci]}${row + 1}`] = {
          v: h,
          t: "s",
          s: ci === 3 ? PRICE_HDR : COL_HDR,
        };
      });
      row++;

      const getCalidadStyle = (calidad: string) => {
        const c = calidad.toUpperCase().trim();
        const baseFont = { sz: 11, name: "Arial" };
        const baseAlign = {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        };

        if (c === "ORIGINAL C/M" || c === "INCELL C/M" || c === "OLED C/M") {
          return s({
            font: { ...baseFont, bold: true, color: { rgb: "000000" } },
            alignment: baseAlign,
          });
        }
        if (c.includes("AMOLED C/M") || c.includes("OLED SOFT")) {
          return s({
            font: { ...baseFont, bold: true, color: { rgb: "8A2BE2" } },
            alignment: baseAlign,
          }); // Violet
        }
        if (c.includes("MECHANIC")) {
          return s({
            font: { ...baseFont, bold: true, color: { rgb: "FF0000" } },
            alignment: baseAlign,
          }); // Red
        }
        return DATA;
      };

      sortedBrands.forEach((brand) => {
        const items = grouped.get(brand)!;

        // Brand header row (black background)
        ws[`A${row + 1}`] = { v: "", t: "s", s: BRAND_HEADER };
        ws[`B${row + 1}`] = { v: brand, t: "s", s: BRAND_HEADER };
        for (let c = 2; c < 7; c++) {
          ws[`${COLS[c]}${row + 1}`] = { v: "", t: "s", s: BRAND_HEADER };
        }
        merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 3 } });
        row++;

        // Data rows
        items.forEach((p) => {
          ws[`A${row + 1}`] = { v: p.marca, t: "s", s: DATA };
          ws[`B${row + 1}`] = { v: p.modelo, t: "s", s: DATA };
          ws[`C${row + 1}`] = {
            v: p.calidad,
            t: "s",
            s: getCalidadStyle(p.calidad),
          };
          ws[`D${row + 1}`] = { v: p.precio, t: "n", s: PRICE_DATA };
          ws[`E${row + 1}`] = { v: "", t: "s", s: DATA };
          ws[`F${row + 1}`] = { v: "", t: "s", s: DATA };
          ws[`I${row + 1}`] = { v: p.id, t: "s", s: DATA };
          ws[`H${row + 1}`] = {
            v: productCategory(p.categoria),
            t: "s",
            s: DATA,
          };
          ws[`G${row + 1}`] = { v: Number(p.stock) || 0, t: "n", s: DATA };
          row++;
        });
      });

      ws["!ref"] = `A1:I${row}`;
      ws["!merges"] = merges;
      ws["!cols"] = [
        { wch: 15 }, // A: MARCA
        { wch: 45 }, // B: MODELO
        { wch: 20 }, // C: CALIDAD
        { wch: 15 }, // D: PRECIO USD
        { wch: 5 }, // E
        { wch: 5 }, // F
        { wch: 12 }, // G: UNIDADES
        { wch: 18 }, // H: CATEGORIA
        { wch: 42 }, // I: ID estable
      ];
      // No ws['!rows'] so Excel auto-fits the row heights for multi-line wrapped text

      const wb = XLSXStyle.utils.book_new();
      XLSXStyle.utils.book_append_sheet(wb, ws, "CATALOGO");
      const fileName = `EL_ARCA_DISPLAY_CLUB_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSXStyle.writeFile(wb, fileName);
      triggerToast(`Catálogo exportado con formato: ${fileName}`);
    } catch {
      triggerToast("No se pudo exportar el catálogo. Inténtalo de nuevo.");
    }
  };

  // Handle Uploading and Parsing New Excel File directly in the browser

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      triggerToast("El archivo supera el límite de 20 MB.");
      return;
    }
    setIsProcessingExcel(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSXRead = await import("xlsx");
        const bstr = evt.target?.result;
        const wb = XLSXRead.read(bstr, { type: "array" });

        // Find sheet 'DISPLAYS' or default to first sheet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sheetName = wb.SheetNames.find(
          (s: any) => String(s).toUpperCase() === "DISPLAYS",
        );
        if (!sheetName) sheetName = wb.SheetNames[0];

        const sheet = wb.Sheets[sheetName];

        // --- Strategy: read with header:1 (raw arrays) so we see EVERY row including brand headers ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawRows: any[][] = XLSXRead.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        });

        if (!rawRows || rawRows.length === 0) {
          triggerToast(
            "El archivo Excel está vacío o no contiene hojas válidas.",
            5000,
          );
          setIsProcessingExcel(false);
          return;
        }

        // Helper: safe string clean (collapses whitespace/newlines)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleanStr = (val: any): string =>
          val != null
            ? String(val).replace(/\n/g, " ").replace(/\s+/g, " ").trim()
            : "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toNum = parseCatalogNumber;

        // -----------------------------------------------------------------
        // Step 1: Find which row is the header row (has MARCA/MODELO/PRECIO)
        // and resolve column indices by NAME so we're independent of position.
        // -----------------------------------------------------------------
        let colMarca = 0;
        let colModelo = 1;
        let colCalidad = 2;
        let colCategoria = -1;
        let colId = -1;
        let colPrecio = 3;
        let colStock = 6; // Column G default (UNIDADES)
        let headerRowIdx = -1;

        for (let r = 0; r < Math.min(10, rawRows.length); r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row)) continue;
          let foundHeader = false;
          row.forEach((cell, idx) => {
            const s = cleanStr(cell).toUpperCase();
            if (s === "ID") {
              colId = idx;
            } else if (s === "MARCA") {
              colMarca = idx;
              foundHeader = true;
            } else if (s === "MODELO") {
              colModelo = idx;
              foundHeader = true;
            } else if (s === "CATEGORIA" || s === "CATEGORÍA") {
              colCategoria = idx;
            } else if (s === "CALIDAD") {
              colCalidad = idx;
            }
            // "PRECIO \nUSD" or "PRECIO USD" or just "PRECIO"
            else if (
              s.startsWith("PRECIO") ||
              (s.includes("USD") && !s.includes("UNIDAD"))
            ) {
              colPrecio = idx;
            }
            // "UNIDADES" or "STOCK" or "CANTIDAD"
            else if (
              s.includes("UNIDAD") ||
              s.includes("STOCK") ||
              s.includes("CANT")
            ) {
              colStock = idx;
            }
          });
          if (foundHeader) {
            headerRowIdx = r;
            break;
          }
        }

        // -----------------------------------------------------------------
        // Step 2: Iterate ALL raw rows, skip the header row, parse products.
        // Brand section headers (e.g. row with MODELO="SAMSUNG" and no price)
        // are used to fill in the currentBrand for rows that lack MARCA.
        // -----------------------------------------------------------------
        const parsedProducts: Array<
          Omit<Product, "stock"> & { stock?: number }
        > = [];
        let currentBrand = "VARIOS";
        let skippedNoPriceCount = 0;
        let zeroStockCount = 0;
        let withStockCount = 0;

        // Canonical brand names that can appear as section headers
        const BRAND_KEYWORDS = [
          "SAMSUNG",
          "IPHONE",
          "XIAOMI",
          "REDMI",
          "POCO",
          "MOTOROLA",
          "HUAWEI",
          "HONOR",
          "INFINIX",
          "TECNO",
          "ITEL",
          "OPPO",
          "REALME",
          "NARZO",
          "RENO",
          "ZTE",
          "NUBIA",
          "TCL",
          "ALCATEL",
          "LG",
          "VIVO",
          "BLACKVIEW",
          "NOKIA",
        ];

        for (let i = 0; i < rawRows.length; i++) {
          if (i === headerRowIdx) continue; // skip header row itself

          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const rawMarca = cleanStr(row[colMarca]);
          const rawModelo = cleanStr(row[colModelo]);
          const rawCalidad = cleanStr(row[colCalidad]);
          const rawPrecio = row[colPrecio];
          // Stock can be null when defval:null — that means blank cell
          const rawStock = row[colStock];

          // Completely empty row → skip
          if (!rawMarca && !rawModelo) continue;

          // Detect brand-section header rows:
          // These have no price AND the modelo (or marca) contains only a brand name.
          const noPriceCell =
            rawPrecio === null || rawPrecio === undefined || rawPrecio === "";
          const upperMod = rawModelo.toUpperCase();
          const upperMarca = rawMarca.toUpperCase();

          // Row is a brand header if: no price AND (modelo is a known brand keyword, or marca is set but modelo is empty)
          if (noPriceCell) {
            const isBrandHeader =
              (!rawModelo && rawMarca) ||
              BRAND_KEYWORDS.some(
                (b) =>
                  upperMod === b ||
                  (upperMod.length < 40 && upperMod.includes(b) && !rawCalidad),
              );

            if (isBrandHeader) {
              currentBrand = (rawMarca || rawModelo).toUpperCase();
              continue;
            }
          }

          // Skip the repeated header row (MODELO/MARCA text as values)
          if (upperMod === "MODELO" || upperMarca === "MARCA") continue;

          // ------ PRICE ------
          const priceNum = toNum(rawPrecio);
          if (noPriceCell) {
            if (rawModelo) skippedNoPriceCount++; // only count real product rows
            continue;
          }

          if (!Number.isFinite(priceNum) || priceNum < 0)
            throw new Error(`Fila ${i + 1}: precio inválido`);

          // ------ STOCK ------
          let stockNum = 0;
          if (
            rawStock !== null &&
            rawStock !== undefined &&
            String(rawStock).trim() !== ""
          ) {
            const s = toNum(rawStock);
            if (!Number.isSafeInteger(s) || s < 0 || s > 10000)
              throw new Error(
                `Fila ${i + 1}: stock debe ser un entero entre 0 y 10.000`,
              );
            stockNum = s;
          }

          if (stockNum > 0) {
            withStockCount++;
          } else {
            zeroStockCount++;
          }

          const finalBrand = (rawMarca || currentBrand || "VARIOS")
            .toUpperCase()
            .trim();
          const finalModel = rawModelo.toUpperCase().trim();

          parsedProducts.push({
            id:
              colId >= 0 && cleanStr(row[colId])
                ? cleanStr(row[colId])
                : `import-${crypto.randomUUID()}`,
            marca: finalBrand,
            categoria: productCategory(
              colCategoria >= 0 ? cleanStr(row[colCategoria]) : undefined,
            ),
            modelo: finalModel,
            calidad: (rawCalidad || "ORIGINAL").toUpperCase().trim(),
            precio: priceNum,
            stock:
              row[colStock] == null || cleanStr(row[colStock]) === ""
                ? undefined
                : stockNum,
          });
        }

        if (parsedProducts.length === 0) {
          triggerToast(
            "⚠️ No se detectaron repuestos válidos en la hoja. Asegúrate de incluir las columnas: MARCA, MODELO, CALIDAD, PRECIO.",
            6000,
          );
          setIsProcessingExcel(false);
          return;
        }

        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync", initialList: parsedProducts }),
        });
        const imported = await response.json();
        if (!response.ok || !imported.success)
          throw new Error(imported.error || "No se pudo importar el archivo");
        setProducts(imported.products);
        setDeletedCount(imported.deletedCount || 0);
        localStorage.setItem(
          "el_arca_products",
          JSON.stringify(imported.products),
        );
        let summaryMsg = `✅ ${parsedProducts.length} productos sincronizados. Los productos ausentes se conservan; el stock en blanco mantiene su valor anterior (1 para altas nuevas).`;
        if (skippedNoPriceCount > 0) {
          summaryMsg += `\n⚠️ Se omitieron ${skippedNoPriceCount} filas por no tener precio.`;
        }
        triggerToast(summaryMsg, 8000);
        setShowExcelModal(false);
      } catch (err) {
        console.error("Error procesando Excel:", err);
        triggerToast(
          err instanceof Error
            ? `❌ ${err.message}`
            : "No se pudo importar el archivo.",
          6000,
        );
      } finally {
        setIsProcessingExcel(false);
        e.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // In /admin, only active products with stock > 0 are shown!
  // Products with stock <= 0 (agotados) belong strictly in /admin/pos/inventario
  const availableProducts = useMemo(() => {
    return products.filter(
      (p) =>
        (p.stock ?? 0) > 0 &&
        (selectedCategory === "ALL" ||
          productCategory(p.categoria) === selectedCategory),
    );
  }, [products, selectedCategory]);

  // Brand frequencies (most products first)
  const brandCounts = useMemo(() => {
    return getBrandCounts(availableProducts);
  }, [availableProducts]);

  // Brand list sorted by frequency (majority of models first)
  const brands = useMemo(() => {
    return ["ALL", ...getSortedBrands(availableProducts)];
  }, [availableProducts]);

  // Filtered list inside admin with Intelligent Fuzzy Search
  const filteredProducts = useMemo(() => {
    const scoredList = availableProducts
      .map((p) => {
        // Filter by selected brand
        if (
          selectedBrand !== "ALL" &&
          !matchBrandFilter(p.marca, selectedBrand)
        ) {
          return null;
        }

        // Filter by search term with fuzzy search
        if (searchTerm.trim()) {
          const { match, score } = fuzzyMatchProduct(p, searchTerm);
          if (!match) return null;
          return { product: p, score };
        }

        return { product: p, score: 0 };
      })
      .filter(
        (item): item is { product: Product; score: number } => item !== null,
      );

    if (searchTerm.trim()) {
      scoredList.sort((a, b) => b.score - a.score);
      return scoredList.map((item) => item.product);
    }

    return sortProductsByPopularity(
      scoredList.map((item) => item.product),
      brandCounts,
    );
  }, [availableProducts, selectedBrand, searchTerm, brandCounts]);

  // Login Screen Render
  if (checkingSession) return <RouteLoading />;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md glass-panel rounded-3xl p-8 border border-[#D4AF37]/30 shadow-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E5C158] to-[#AA8826] p-[1px] shadow-gold-glow mx-auto flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-12 h-12 object-contain"
              />
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

          <div className="pt-2 text-center">
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-[#D4AF37] transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <span>←</span> Volver al Catálogo Público
            </Link>
          </div>
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
        totalProducts={loading ? null : availableProducts.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Notificación de elTOQUE (Colapsable con Skeleton Anti-CLS) */}
        {loadingRates ? (
          isEltoqueMinimized ? (
            <div className="glass-panel p-2 px-4 rounded-xl border border-white/10 inline-flex items-center gap-3 animate-pulse w-56 h-9">
              <div className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
              <div className="h-3 w-32 bg-white/10 rounded" />
            </div>
          ) : (
            <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse shadow-lg">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-44 bg-white/10 rounded-lg" />
                    <div className="h-4 w-24 bg-white/10 rounded-full" />
                  </div>
                  <div className="h-3 w-72 max-w-full bg-white/10 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                <div className="h-8 w-20 bg-white/10 rounded-xl" />
                <div className="h-8 w-32 bg-white/10 rounded-xl" />
              </div>
            </div>
          )
        ) : eltoqueRate === null ? (
          <div className="glass-panel p-4 rounded-2xl border border-white/10">
            <p role="status" className="text-xs leading-relaxed text-gray-400">
              {referenceStatus}
            </p>
          </div>
        ) : isEltoqueMinimized ? (
          <div
            className={`glass-panel p-2 px-4 rounded-xl border inline-flex items-center gap-3 animate-fade-in shadow-lg cursor-pointer transition-colors w-max ${
              eltoqueRate === currentRate
                ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                : "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20"
            }`}
            onClick={() => {
              setIsEltoqueMinimized(false);
              localStorage.setItem("el_arca_eltoque_minimized", "false");
            }}
          >
            {eltoqueRate === currentRate ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : eltoqueRate > (currentRate ?? 0) ? (
              <TrendingUp className="w-4 h-4 text-rose-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-emerald-400" />
            )}
            <span className="text-xs font-bold text-white">
              Alerta elTOQUE: {eltoqueRate} CUP
            </span>
            <button className="ml-2 text-blue-300 hover:text-white transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            className={`glass-panel p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in shadow-lg ${
              eltoqueRate === currentRate
                ? "border-emerald-500/40 bg-emerald-500/10 shadow-emerald-500/5"
                : "border-blue-500/40 bg-blue-500/10 shadow-blue-500/5"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  eltoqueRate === currentRate
                    ? "bg-emerald-500/20"
                    : "bg-blue-500/20"
                }`}
              >
                {eltoqueRate === currentRate ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : eltoqueRate > (currentRate ?? 0) ? (
                  <TrendingUp className="w-5 h-5 text-rose-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                  {referenceStale
                    ? "Referencia pendiente de verificación"
                    : eltoqueRate === currentRate
                      ? "Mercado Sincronizado"
                      : "Actualización de Mercado: elTOQUE"}
                  <span className="px-2 py-0.5 rounded-full bg-[#10131E] text-[10px] text-gray-400 border border-white/5">
                    1 USD = {eltoqueRate} CUP
                  </span>
                </h3>
                <p
                  className={`text-xs mt-0.5 max-w-xl ${eltoqueRate === currentRate ? "text-emerald-200/80" : "text-blue-200/80"}`}
                >
                  {eltoqueRate === currentRate
                    ? `Excelente. Tu catálogo está perfectamente sincronizado con la tasa actual del mercado (${currentRate} CUP).`
                    : eltoqueRate < (currentRate ?? 0)
                      ? `📉 elTOQUE reporta una baja. Tu tasa actual está por encima (${currentRate} CUP). ¿Deseas ajustar tus precios para mantener competitividad?`
                      : `📈 elTOQUE reporta un alza. Tu tasa actual está por debajo (${currentRate} CUP). Riesgo de pérdida de margen detectado.`}
                </p>
                <p
                  role="status"
                  className="text-xs leading-relaxed text-gray-400 mt-2 max-w-xl break-words"
                >
                  {referenceStatus}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setIsEltoqueMinimized(true);
                  localStorage.setItem("el_arca_eltoque_minimized", "true");
                }}
                className="px-4 py-2 rounded-xl bg-[#10131E] hover:bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold transition-colors flex items-center gap-1"
              >
                Ocultar
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              {eltoqueRate !== currentRate && (
                <button
                  onClick={handleAjustarTasa}
                  disabled={referenceStale || savingRate}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all hover:scale-105"
                >
                  Ajustar a {eltoqueRate} CUP
                </button>
              )}
            </div>
          </div>
        )}

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
              Puedes subir un nuevo Excel (.xlsx) o exportar el catálogo en
              tiempo real.
            </p>
          </div>

          {/* Action Buttons: 2 filas organizadas */}
          <div className="flex flex-col gap-2.5 w-full lg:w-auto shrink-0">
            {/* Fila 1: IA WhatsApp, Etiquetador, Exportar Excel */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
              {/* IA WhatsApp */}
              <Link
                id="btn-open-whatsapp-bot"
                href="/admin/whatsapp"
                className="h-11 px-4 rounded-xl bg-gradient-to-r from-purple-600/25 to-indigo-600/25 hover:from-purple-600/40 hover:to-indigo-600/40 text-purple-200 border border-purple-500/45 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm shadow-purple-950/40"
              >
                <MessageSquare className="w-4 h-4 text-purple-300 motion-safe:animate-pulse shrink-0" />
                <span>IA WhatsApp</span>
              </Link>

              {/* Etiquetador */}
              <Link
                id="btn-open-labels"
                href="/admin/etiquetas"
                className="h-11 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
              >
                <Tag className="w-4 h-4 text-amber-400 motion-safe:animate-pulse shrink-0" />
                <span>Etiquetador</span>
              </Link>

              {/* Exportar Excel */}
              <button
                id="btn-export-excel"
                onClick={handleExportExcel}
                className="h-11 px-4 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
              >
                <Download className="w-4 h-4 text-emerald-400 motion-safe:animate-pulse shrink-0" />
                <span>Exportar Excel</span>
              </button>
            </div>

            {/* Fila 2: Asistente IA, Unir Duplicados, Cargar Excel */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
              {/* Asistente IA */}
              <Link
                id="btn-open-ai-assistant"
                href="/admin/ia"
                className="h-11 px-4 rounded-xl bg-gradient-to-r from-indigo-600/25 to-violet-600/25 hover:from-indigo-600/40 hover:to-violet-600/40 text-indigo-200 border border-indigo-500/45 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm shadow-indigo-950/40"
              >
                <Sparkles className="w-4 h-4 text-indigo-300 motion-safe:animate-pulse shrink-0" />
                <span>Asistente IA</span>
              </Link>

              {/* Unir Duplicados */}
              <Link
                id="btn-open-duplicates"
                href="/admin/duplicados"
                className="h-11 px-4 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#E5C158] border border-[#D4AF37]/45 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
              >
                <GitMerge className="w-4 h-4 text-[#D4AF37] motion-safe:animate-pulse shrink-0" />
                <span>Unir Duplicados</span>
              </Link>

              {/* Cargar Excel */}
              <button
                id="btn-open-excel-modal"
                onClick={() => setShowExcelModal(true)}
                className="h-11 px-4 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 text-teal-400 motion-safe:animate-pulse shrink-0" />
                <span>Cargar Excel</span>
              </button>
            </div>
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
                  Ocultos ({deletedCount})
                </span>
              </div>
              <span className="text-[11px] text-rose-300 font-semibold mt-0.5 block">
                Ver todos / Reactivar →
              </span>
            </div>
          </Link>
        </div>

        <CategoryFilter
          loading={loading}
          products={products.filter((p) => (p.stock ?? 0) > 0)}
          value={selectedCategory}
          onChange={(c) => {
            setSelectedCategory(c);
            setSelectedBrand("ALL");
          }}
        />

        {/* Search filter and Brand pills for Admin */}
        <div className="space-y-3">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <input
              id="input-admin-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar repuesto para editar, eliminar o revisar..."
              className="w-full pl-11 pr-10 py-3.5 bg-[#10131E] border border-[#D4AF37]/30 rounded-2xl text-white placeholder-gray-400 text-sm focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Brand Filter Chips */}
          <BrandFilter
            brands={brands.filter((b) => b !== "ALL")}
            selectedBrand={selectedBrand}
            onBrandSelect={setSelectedBrand}
            brandCounts={brandCounts}
            totalCount={availableProducts.length}
          />
        </div>

        {/* Admin Products List */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <SkeletonProductCard key={i} />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <AdminProductCard
                key={product.id}
                product={product}
                exchangeRate={currentRate}
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
              <h3 className="text-xl font-bold text-white">
                Actualizar Catálogo desde Excel
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Selecciona tu archivo de Excel (ej.{" "}
                <strong className="text-emerald-300">
                  EL ARCA DISPLAY CLUB.xlsx
                </strong>
                ). El sistema leerá automáticamente la hoja{" "}
                <strong>DISPLAYS</strong> y actualizará todos los modelos para
                tus clientes al instante.
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
                    Soporta archivos .xlsx con las columnas MARCA, MODELO,
                    CALIDAD, PRECIO
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
              <h3 className="text-xl font-bold text-white">Agregar producto</h3>
              <p className="text-xs text-gray-400">
                Añade un repuesto individual al catálogo público en tiempo real.
              </p>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <label className="block text-xs font-semibold text-gray-300">
                Categoría
                <select
                  aria-label="Categoría del nuevo producto"
                  value={newCategory}
                  onChange={(e) => {
                    const c = e.target.value as ProductCategory;
                    setNewCategory(c);
                    setNewCalidadSelect(
                      CATEGORIES.find((x) => x.id === c)!.qualities[0],
                    );
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#10131E] p-3 text-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Marca
                </label>
                <input
                  type="text"
                  value={newMarca}
                  onChange={(e) => setNewMarca(e.target.value.toUpperCase())}
                  placeholder="ej. SAMSUNG, IPHONE, XIAOMI"
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none uppercase font-mono"
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
                  onChange={(e) => setNewModelo(e.target.value.toUpperCase())}
                  placeholder="ej. GALAXY A55 5G / A556"
                  className="w-full px-4 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-sm focus:border-[#D4AF37] focus:outline-none uppercase font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 [&>div:first-child]:col-span-2 sm:[&>div:first-child]:col-span-1">
                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1">
                    Calidad
                  </label>
                  <select
                    value={newCalidadSelect}
                    onChange={(e) => setNewCalidadSelect(e.target.value)}
                    className="w-full px-3 py-3 bg-[#10131E] border border-white/10 rounded-xl text-white text-xs focus:border-[#D4AF37] focus:outline-none cursor-pointer"
                  >
                    {CATEGORIES.find(
                      (c) => c.id === newCategory,
                    )!.qualities.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
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

              {newCalidadSelect === "CUSTOM" && (
                <div>
                  <label className="text-xs font-semibold text-amber-300 block mb-1">
                    Escribe la calidad personalizada (ej. ORIGINAL C/M
                    ESPECIAL):
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
                  Guardar producto
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
            toastMessage.toLowerCase().includes("error") ||
            toastMessage.includes("❌")
              ? "border-rose-500/60 bg-[#1A1118] text-rose-200 shadow-rose-950/50"
              : toastMessage.includes("⚠️")
                ? "border-amber-500/60 bg-[#1A1512] text-amber-200 shadow-amber-950/50"
                : "border-[#D4AF37]/40 bg-[#121522] text-white shadow-gold-glow"
          }`}
        >
          {toastMessage.toLowerCase().includes("error") ||
          toastMessage.includes("❌") ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : toastMessage.includes("⚠️") ? (
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
