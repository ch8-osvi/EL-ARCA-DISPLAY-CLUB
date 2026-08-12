'use client';

import React from 'react';
import Link from 'next/link';
import { ViewMode } from '@/lib/types';
import { LayoutGrid, List, Lock, RefreshCw, Users } from 'lucide-react';

interface NavbarProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  totalProducts?: number;
  isAdmin?: boolean;
  onLogout?: () => void;
  onRestoreCatalog?: () => void;
}

export default function Navbar({
  viewMode = 'grid',
  onViewModeChange,
  totalProducts,
  isAdmin = false,
  onLogout,
  onRestoreCatalog,
}: NavbarProps) {
  const whatsappGroupUrl =
    'https://chat.whatsapp.com/EJLkGTDLoDX15fyILvOge6?s=cl&p=i&ilr=2&amv=1';

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
        {/* Brand Identity with Transparent PNG Logo */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#E5C158]/20 via-[#D4AF37]/10 to-transparent p-1 border border-[#D4AF37]/30 shadow-gold-glow group-hover:scale-105 transition-transform duration-300 flex items-center justify-center shrink-0">
            <img
              src="/logo.png"
              alt="EL ARCA DISPLAY CLUB Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_2px_8px_rgba(212,175,55,0.4)]"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm sm:text-lg font-extrabold tracking-wide sm:tracking-wider text-white flex items-center gap-1 leading-tight whitespace-nowrap">
              EL ARCA <span className="gold-gradient-text">DISPLAY</span>
            </span>
            <span className="text-[9px] sm:text-[10px] font-extrabold tracking-[0.25em] sm:tracking-[0.3em] text-[#D4AF37] uppercase -mt-0.5">
              CLUB
            </span>
          </div>
        </Link>

        {/* Center/Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* WhatsApp Group Link (Desktop) */}
          <a
            href={whatsappGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all duration-200"
            title="Unirse al Grupo Oficial de WhatsApp"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Grupo WhatsApp</span>
          </a>

          {/* Total Modelos Badge */}
          {typeof totalProducts === 'number' && (
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#171B2B] border border-[#D4AF37]/20 text-[11px] sm:text-xs text-[#E5DFD9]">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-white">{totalProducts}</span>
              <span className="hidden sm:inline"> Modelos</span>
            </div>
          )}

          {/* View mode toggle (ONLY ON DESKTOP md:flex - HIDE ON MOBILE) */}
          {onViewModeChange && (
            <div className="hidden md:flex items-center bg-[#10131E] border border-white/10 rounded-xl p-1">
              <button
                id="view-mode-grid"
                onClick={() => onViewModeChange('grid')}
                className={`p-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#AA8826] text-black font-bold shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista en Cuadrícula"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Cuadrícula</span>
              </button>
              <button
                id="view-mode-table"
                onClick={() => onViewModeChange('table')}
                className={`p-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#AA8826] text-black font-bold shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Vista en Lista Compacta"
              >
                <List className="w-4 h-4" />
                <span>Lista</span>
              </button>
            </div>
          )}

          {/* Admin Navigation / Actions */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {onRestoreCatalog && (
                <button
                  id="btn-restore-catalog"
                  onClick={onRestoreCatalog}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all duration-200"
                  title="Restaurar lista original del Excel"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restaurar</span>
                </button>
              )}

              <button
                id="btn-logout"
                onClick={onLogout}
                className="px-3 py-1.5 sm:py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all duration-200"
              >
                Salir
              </button>
            </div>
          ) : (
            <Link
              id="link-admin-panel"
              href="/admin"
              className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#171B2B] hover:bg-[#22273D] border border-[#D4AF37]/30 text-xs font-semibold text-[#F3E0A9] hover:text-white flex items-center gap-1.5 transition-all duration-200 group"
            >
              <Lock className="w-3.5 h-3.5 text-[#D4AF37] group-hover:scale-110 transition-transform" />
              <span>Admin</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
