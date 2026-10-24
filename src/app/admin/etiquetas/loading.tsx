export default function EtiquetasLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-amber-500/10 rounded-full border border-amber-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-[#D4AF37]/15 rounded-xl animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Banner Skeleton */}
        <div className="glass-panel rounded-3xl p-6 border border-[#D4AF37]/20 space-y-3 animate-pulse">
          <div className="h-6 w-48 bg-[#D4AF37]/20 rounded-full" />
          <div className="h-8 w-72 bg-white/15 rounded-xl" />
          <div className="h-4 w-96 max-w-full bg-white/10 rounded-lg" />
        </div>

        {/* 2-Column Editor / Preview Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 glass-panel rounded-3xl p-5 border border-white/10 space-y-4 animate-pulse">
            <div className="h-6 w-36 bg-white/15 rounded-lg" />
            <div className="space-y-3">
              <div className="h-10 w-full bg-[#10131E] rounded-xl border border-white/5" />
              <div className="h-10 w-full bg-[#10131E] rounded-xl border border-white/5" />
              <div className="h-10 w-full bg-[#10131E] rounded-xl border border-white/5" />
            </div>
            <div className="h-12 w-full bg-[#D4AF37]/20 rounded-2xl border border-[#D4AF37]/30 mt-4" />
          </div>

          <div className="lg:col-span-7 glass-panel rounded-3xl p-5 border border-white/10 space-y-4 animate-pulse">
            <div className="h-6 w-40 bg-white/15 rounded-lg" />
            <div className="h-72 w-full bg-[#10131E] rounded-2xl border border-white/5 flex items-center justify-center">
              <div className="h-32 w-56 bg-white/5 rounded-xl border border-dashed border-white/10" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
