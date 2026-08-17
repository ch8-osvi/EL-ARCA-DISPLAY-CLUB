'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import SearchBar from '../components/SearchBar';
import BrandFilter from '../components/BrandFilter';
import ProductCard from '../components/ProductCard';
import ProductTable from '../components/ProductTable';
import seedProducts from '../data/products_seed.json';
import { Product, ViewMode, SortOption } from '../lib/types';
import { Sparkles, SearchX, MessageSquare, Users, ShieldCheck } from 'lucide-react';

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedQuality, setSelectedQuality] = useState('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const whatsappNumber = '5352031972';
  const whatsappGroupUrl =
    'https://chat.whatsapp.com/EJLkGTDLoDX15fyILvOge6?s=cl&p=i&ilr=2&amv=1';

  // Load products from API with fallback to localStorage / seed
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          const data = await res.json();
          if (data.products && Array.isArray(data.products)) {
            setProducts(data.products);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('API error, loading local seed fallback', err);
      }

      // Check local storage
      const local = localStorage.getItem('el_arca_products');
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
    }

    loadData();
  }, []);

  // Sync state to local storage for offline fallback
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem('el_arca_products', JSON.stringify(products));
    }
  }, [products]);

  // Helper to get canonical brand group
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

  // Extract brand frequencies
  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      if (p.marca) {
        const canonical = getCanonicalBrand(p.marca);
        counts.set(canonical, (counts.get(canonical) || 0) + 1);
      }
    });
    return counts;
  }, [products]);

  // Extract unique brands and sort by frequency (most models first)
  const brands = useMemo(() => {
    return Array.from(brandCounts.keys()).sort((a, b) => brandCounts.get(b)! - brandCounts.get(a)!);
  }, [brandCounts]);

  const qualities = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.calidad) set.add(p.calidad);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filter & Sort Products Instantaneously
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Brand filter with flexible matching for consolidated groups
        if (selectedBrand !== 'ALL') {
          const pm = p.marca.toUpperCase();
          const fb = selectedBrand.toUpperCase();
          const filterComponents = fb.split('/').map((s) => s.trim());
          const hasMatch = filterComponents.some((comp) => pm.includes(comp));
          if (!hasMatch) return false;
        }

        // Quality filter
        if (selectedQuality !== 'ALL' && p.calidad !== selectedQuality) {
          return false;
        }

        // Search term filter (Brand, Model, Quality, Price)
        if (searchTerm.trim() !== '') {
          const query = searchTerm.toLowerCase().trim();
          const matchMarca = p.marca.toLowerCase().includes(query);
          const matchModelo = p.modelo.toLowerCase().includes(query);
          const matchCalidad = p.calidad.toLowerCase().includes(query);
          const matchPrecio = p.precio.toString().includes(query);
          return matchMarca || matchModelo || matchCalidad || matchPrecio;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'price-asc') return a.precio - b.precio;
        if (sortOption === 'price-desc') return b.precio - a.precio;
        if (sortOption === 'brand-asc') return a.marca.localeCompare(b.marca);
        if (sortOption === 'model-asc') return a.modelo.localeCompare(b.modelo);
        
        // Default sort: Brand Frequency (Descending) -> Brand Name -> Model
        const countA = brandCounts.get(getCanonicalBrand(a.marca)) || 0;
        const countB = brandCounts.get(getCanonicalBrand(b.marca)) || 0;

        if (countA !== countB) {
          return countB - countA;
        }

        const brandCompare = a.marca.localeCompare(b.marca);
        if (brandCompare !== 0) return brandCompare;

        return a.modelo.localeCompare(b.modelo);
      });
  }, [products, searchTerm, selectedBrand, selectedQuality, sortOption, brandCounts]);

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col">
      {/* Navigation Header */}
      <Navbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalProducts={filteredProducts.length}
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
              Encuentra el Display Exacto para tu Celular en{' '}
              <span className="gold-gradient-text">EL ARCA</span>
            </h1>

            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Explora nuestra lista actualizada de repuestos pantallas en calidad{' '}
              <strong className="text-[#F3E0A9]">Original, InCell, OLED y Con Marco (C/M)</strong>. Búsqueda instantánea en tiempo real y cotización directa por WhatsApp.
            </p>

            {/* Direct WhatsApp Callouts & Group Link */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola! Deseo información general sobre el catálogo de displays en EL ARCA DISPLAY CLUB.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#E5C158] to-[#D4AF37] text-black font-extrabold text-sm shadow-gold-glow hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-black stroke-[2.5]" />
                <span>Contactar por WhatsApp (+53 52031972)</span>
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

        {/* Search & Filter Controls */}
        <section className="space-y-4">
          <SearchBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            selectedQuality={selectedQuality}
            onQualityChange={setSelectedQuality}
            sortOption={sortOption}
            onSortChange={setSortOption}
            qualities={qualities}
          />

          <BrandFilter
            brands={brands}
            selectedBrand={selectedBrand}
            onBrandSelect={setSelectedBrand}
          />
        </section>

        {/* Results Counter Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-400">
              Mostrando <strong className="text-white">{filteredProducts.length}</strong> de{' '}
              <strong className="text-[#D4AF37]">{products.length}</strong> modelos
            </span>
            {(searchTerm || selectedBrand !== 'ALL' || selectedQuality !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedBrand('ALL');
                  setSelectedQuality('ALL');
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
          // Skeleton loading state
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-5 flex flex-col gap-3 animate-pulse">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-6 w-20 bg-white/10 rounded-lg" />
                  <div className="h-5 w-16 bg-white/10 rounded-full" />
                </div>
                <div className="h-4 w-full bg-white/10 rounded-lg" />
                <div className="h-4 w-3/4 bg-white/10 rounded-lg" />
                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="h-7 w-16 bg-white/10 rounded-lg" />
                  <div className="h-8 w-24 bg-white/10 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <ProductTable products={filteredProducts} />
          )
        ) : (
          /* Empty Search State */
          <div className="glass-panel rounded-3xl py-16 px-6 text-center space-y-4 max-w-lg mx-auto border border-white/10">
            <div className="w-16 h-16 rounded-2xl bg-[#171B2B] border border-white/10 flex items-center justify-center mx-auto text-[#D4AF37]">
              <SearchX className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">No se encontraron displays</h3>
            <p className="text-gray-400 text-sm">
              No hay coincidencias para tu búsqueda "{searchTerm}". Intenta buscar con otro término como "Samsung", "OLED" o limpia los filtros.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedBrand('ALL');
                setSelectedQuality('ALL');
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
                Únete a nuestro grupo oficial de WhatsApp para enterarte de nuevos arribos, ofertas y disponibilidad diaria.
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
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="text-sm font-bold text-white">
              EL ARCA <span className="gold-gradient-text">DISPLAY CLUB</span>
            </span>
          </div>

          <div className="text-xs text-gray-400 text-center md:text-right space-y-1">
            <p>© 2026 EL ARCA DISPLAY CLUB. Todos los derechos reservados.</p>
            <p className="text-gray-500">
              Atención WhatsApp: <strong className="text-[#E5C158]">+53 52031972</strong> |{' '}
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
