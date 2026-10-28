"use client";
import { useWhatsAppPhone } from "@/lib/useWhatsAppPhone";

import { useActiveExchangeRate } from "@/lib/useActiveExchangeRate";
import React, { useState, useEffect, useMemo } from "react";
import Navbar from "@/components/Navbar";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import ProductCard from "@/components/ProductCard";
import ProductTable from "@/components/ProductTable";

import CategoryFilter from "@/components/CategoryFilter";
import {
  CATEGORIES,
  productCategory,
  type ProductCategory,
} from "@/lib/categories";
import { Product, ViewMode, SortOption, Currency } from "@/lib/types";
import {
  Sparkles,
  SearchX,
  MessageSquare,
  Users,
  ShieldCheck,
} from "lucide-react";
import {
  getCanonicalBrand,
  getBrandCounts,
  getSortedBrands,
  matchBrandFilter,
  sortProductsByPopularity,
} from "@/lib/brandUtils";
import { fuzzyMatchProduct } from "@/lib/searchUtils";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState<
    ProductCategory | "ALL"
  >("ALL");
  const changeCategory = (value: ProductCategory | "ALL") => {
    setSelectedCategory(value);
    setSelectedBrand("ALL");
    setSelectedQuality("ALL");
  };
  const [selectedQuality, setSelectedQuality] = useState("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const currency: Currency = "CUP";
  const [exchangeRate] = useActiveExchangeRate();

  const whatsappNumber = useWhatsAppPhone();
  const whatsappGroupUrl =
    "https://chat.whatsapp.com/EJLkGTDLoDX15fyILvOge6?s=cl&p=i&ilr=2&amv=1";

  // Revalidate quietly so stock and promotions do not remain stale in an open tab.
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    async function loadData(quiet = false) {
      if (controller) return;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), 12000);
      if (!quiet) setLoading(true);
      try {
        const res = await fetch("/api/products", {
          cache: "no-store",
          signal: request.signal,
        });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.products))
          throw new Error("Unverified catalog");
        if (!active) return;
        setProducts(data.products);
        setCatalogError("");
      } catch {
        if (!active) return;
        if (!quiet) {
          try {
            const cached = JSON.parse(
              localStorage.getItem("el_arca_products") || "[]",
            );
            setProducts(
              Array.isArray(cached)
                ? cached.filter(
                    (p) =>
                      p &&
                      typeof p.id === "string" &&
                      typeof p.marca === "string" &&
                      typeof p.modelo === "string" &&
                      typeof p.calidad === "string" &&
                      Number.isFinite(p.precio) &&
                      p.precio >= 0 &&
                      Number.isSafeInteger(p.stock) &&
                      p.stock >= 0 &&
                      !p.isHidden &&
                      (p.categoria === "TAPA" ||
                        CATEGORIES.some(
                          (c) => c.id === (p.categoria || "DISPLAY"),
                        )),
                  )
                : [],
            );
          } catch {
            setProducts([]);
          }
        }
        setCatalogError(
          "No pudimos verificar el catálogo en este momento. Los datos mostrados pueden estar desactualizados; confirma precio y disponibilidad por WhatsApp.",
        );
      } finally {
        clearTimeout(timeout);
        if (controller === request) controller = undefined;
        if (active) setLoading(false);
      }
    }
    void loadData();
    const refresh = () => {
      if (!document.hidden) void loadData(true);
    };
    const interval = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [retryLoad]);

  // Sync state to local storage for offline fallback
  useEffect(() => {
    if (!loading && !catalogError) {
      try {
        localStorage.setItem("el_arca_products", JSON.stringify(products));
      } catch {}
    }
  }, [products, loading, catalogError]);

  // Only displays with stock > 0 are shown to public clients
  const allAvailableProducts = useMemo(() => {
    return products.filter((p) => (p.stock ?? 0) > 0);
  }, [products]);
  const availableProducts = useMemo(
    () =>
      allAvailableProducts.filter(
        (p) =>
          selectedCategory === "ALL" ||
          productCategory(p.categoria) === selectedCategory,
      ),
    [allAvailableProducts, selectedCategory],
  );

  // Extract brand frequencies
  const brandCounts = useMemo(() => {
    return getBrandCounts(availableProducts);
  }, [availableProducts]);

  // Extract unique brands and sort by frequency (most models first)
  const brands = useMemo(() => {
    return getSortedBrands(availableProducts);
  }, [availableProducts]);

  const qualities = useMemo(() => {
    const set = new Set<string>();
    availableProducts.forEach((p) => {
      if (p.calidad) set.add(p.calidad);
    });
    return Array.from(set).sort();
  }, [availableProducts]);

  // Filter & Sort Products Instantaneously with Intelligent Fuzzy/Token Matching
  const filteredProducts = useMemo(() => {
    const scoredList = availableProducts
      .map((p) => {
        // Brand filter with flexible matching for consolidated groups
        if (!matchBrandFilter(p.marca, selectedBrand)) {
          return null;
        }

        // Quality filter
        if (selectedQuality !== "ALL" && p.calidad !== selectedQuality) {
          return null;
        }

        // Fuzzy & Token search
        if (searchTerm.trim() !== "") {
          const { match, score } = fuzzyMatchProduct(p, searchTerm);
          if (!match) return null;
          return { product: p, score };
        }

        return { product: p, score: 0 };
      })
      .filter(
        (item): item is { product: Product; score: number } => item !== null,
      );

    // If active search without explicit sort, rank by fuzzy match score first, then popularity
    if (searchTerm.trim() !== "" && sortOption === "default") {
      scoredList.sort((a, b) => b.score - a.score);
      return scoredList.map((item) => item.product);
    }

    const list = scoredList.map((item) => item.product);

    if (sortOption === "price-asc")
      return [...list].sort((a, b) => a.precio - b.precio);
    if (sortOption === "price-desc")
      return [...list].sort((a, b) => b.precio - a.precio);
    if (sortOption === "brand-asc")
      return [...list].sort((a, b) => a.marca.localeCompare(b.marca));
    if (sortOption === "model-asc")
      return [...list].sort((a, b) => a.modelo.localeCompare(b.modelo));

    return sortProductsByPopularity(list, brandCounts);
  }, [
    availableProducts,
    searchTerm,
    selectedBrand,
    selectedQuality,
    sortOption,
    brandCounts,
  ]);

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col">
      {/* Navigation Header */}
      <Navbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalProducts={loading ? null : filteredProducts.length}
        exchangeRate={exchangeRate}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <section className="glass-panel rounded-3xl p-6 sm:p-10 border border-[#D4AF37]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#171B2B] border border-[#D4AF37]/30 text-xs font-bold text-[#E5C158]">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Catálogo Oficial de Displays & Repuestos
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Encuentra el repuesto para tu celular en{" "}
              <span className="gold-gradient-text">EL ARCA</span>
            </h1>

            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Explora pantallas y repuestos organizados por categoría. En
              pantallas encontrarás calidad{" "}
              <strong className="text-[#F3E0A9]">
                Original, InCell, OLED y Con Marco (C/M)
              </strong>
              . Búsqueda instantánea en tiempo real y cotización directa por
              WhatsApp.
            </p>

            {/* Direct WhatsApp Callouts & Group Link */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href={
                  whatsappNumber
                    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola! Deseo información general sobre el catálogo de displays en EL ARCA DISPLAY CLUB.")}`
                    : undefined
                }
                aria-disabled={!whatsappNumber}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#E5C158] to-[#D4AF37] text-black font-extrabold text-sm shadow-gold-glow hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-black stroke-[2.5]" />
                <span>
                  Contactar por WhatsApp
                  {whatsappNumber ? ` (+${whatsappNumber})` : ""}
                </span>
              </a>

              {/* WhatsApp Group Button */}
              <a
                href={whatsappGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-sm font-extrabold hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Unirse al Grupo de WhatsApp</span>
              </a>
            </div>
          </div>
        </section>

        {catalogError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200"
          >
            <p className="max-w-3xl">{catalogError}</p>
            <button
              onClick={() => setRetryLoad((n) => n + 1)}
              className="rounded-xl border border-amber-400/30 px-3 py-2 font-bold"
            >
              Reintentar
            </button>
          </div>
        )}
        {/* Search & Filter Controls */}
        <section className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              {/* Skeleton para SearchBar */}
              <div className="h-14 sm:h-16 bg-[#171B2B]/50 border border-white/5 rounded-2xl animate-pulse w-full"></div>
              <CategoryFilter
                loading
                products={[]}
                value="ALL"
                onChange={() => {}}
              />
              {/* Skeleton para BrandFilter */}
              <div className="h-12 sm:h-14 bg-[#171B2B]/50 border border-white/5 rounded-2xl animate-pulse w-full"></div>
            </div>
          ) : (
            <>
              <SearchBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                selectedQuality={selectedQuality}
                onQualityChange={setSelectedQuality}
                sortOption={sortOption}
                onSortChange={setSortOption}
                qualities={qualities}
              />

              <CategoryFilter
                products={allAvailableProducts}
                value={selectedCategory}
                onChange={changeCategory}
                publicCatalog
              />
              <BrandFilter
                brands={brands}
                selectedBrand={selectedBrand}
                onBrandSelect={setSelectedBrand}
                brandCounts={brandCounts}
                totalCount={availableProducts.length}
              />
            </>
          )}
        </section>

        {/* Results Counter Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-400">
              Mostrando{" "}
              <strong className="text-white">{filteredProducts.length}</strong>{" "}
              de <strong className="text-[#D4AF37]">{products.length}</strong>{" "}
              modelos
            </span>
            {(searchTerm ||
              selectedCategory !== "ALL" ||
              selectedBrand !== "ALL" ||
              selectedQuality !== "ALL") && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("ALL");
                  setSelectedBrand("ALL");
                  setSelectedQuality("ALL");
                }}
                className="text-xs text-[#E5C158] underline hover:text-white ml-2 transition-colors"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Catalog Grid or Table View */}
        {loading ? (
          // Luxury Skeleton loading state matching ProductCard dimensions
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="glass-card rounded-2xl p-5 flex flex-col justify-between min-h-[220px] animate-pulse border border-white/5 bg-white/[0.02]"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="h-5 w-20 bg-white/10 rounded-md" />
                    <div className="h-5 w-24 bg-white/10 rounded-full" />
                  </div>
                  <div className="h-5 w-4/5 bg-white/15 rounded-lg" />
                  <div className="h-3.5 w-1/2 bg-white/5 rounded-md" />
                </div>
                <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-20 bg-white/15 rounded-lg" />
                    <div className="h-5 w-16 bg-white/5 rounded" />
                  </div>
                  <div className="h-9 w-28 ml-auto bg-emerald-500/10 border border-emerald-500/20 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currency={currency}
                  exchangeRate={exchangeRate}
                />
              ))}
            </div>
          ) : (
            <ProductTable
              products={filteredProducts}
              currency={currency}
              exchangeRate={exchangeRate}
            />
          )
        ) : (
          /* Empty Search State */
          <div className="glass-panel rounded-3xl py-16 px-6 text-center space-y-4 max-w-lg mx-auto border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-[#171B2B] border border-white/10 flex items-center justify-center mx-auto text-[#D4AF37]">
              <SearchX className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">
              No se encontraron displays
            </h3>
            <p className="text-gray-400 text-sm">
              No hay coincidencias para tu búsqueda "{searchTerm}". Intenta
              buscar con otro término como "Samsung", "OLED" o limpia los
              filtros.
            </p>
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedBrand("ALL");
                setSelectedQuality("ALL");
              }}
              className="px-5 py-2.5 rounded-xl bg-[#171B2B] hover:bg-[#22273D] text-[#F3E0A9] border border-[#D4AF37]/30 text-xs font-bold transition-all"
            >
              Restablecer Búsqueda
            </button>
          </div>
        )}

        {/* Community Callout Banner */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-6 bg-gradient-to-r from-emerald-950/20 via-[#11141F] to-[#11141F]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Comunidad Oficial EL ARCA DISPLAY CLUB
              </h3>
              <p className="text-xs text-gray-300">
                Únete a nuestro grupo oficial de WhatsApp para enterarte de
                nuevos arribos, ofertas y disponibilidad diaria.
              </p>
            </div>
          </div>

          <a
            href={whatsappGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-900/40 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
          >
            Unirme al Grupo Oficial
          </a>
        </section>
      </main>

      {/* Luxury Footer */}
      <footer className="border-t border-white/10 bg-[#06070B] py-10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
            <span className="text-sm font-bold text-white">
              EL ARCA <span className="gold-gradient-text">DISPLAY CLUB</span>
            </span>
          </div>

          <div className="text-xs text-gray-400 text-center md:text-right space-y-1">
            <p>© 2026 EL ARCA DISPLAY CLUB. Todos los derechos reservados.</p>
            <p className="text-gray-500">
              Atención WhatsApp:{" "}
              <strong className="text-[#E5C158]">
                {whatsappNumber ? `+${whatsappNumber}` : "No disponible"}
              </strong>{" "}
              |{" "}
              <a
                href={whatsappGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline hover:text-emerald-300"
              >
                Grupo Oficial de WhatsApp
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
