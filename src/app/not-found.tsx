import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center p-4">
      <div className="glass-panel rounded-3xl p-8 max-w-md w-full border border-white/10 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#171B2B] border border-[#D4AF37]/30 flex items-center justify-center mx-auto text-[#D4AF37]">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white">Página no encontrada</h2>
        <p className="text-sm text-gray-400">
          La ruta solicitada no existe en el catálogo de EL ARCA DISPLAY CLUB.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-3 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow"
        >
          Volver al Catálogo
        </Link>
      </div>
    </div>
  );
}
