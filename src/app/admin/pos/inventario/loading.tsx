export default function InventarioLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-emerald-500/10 rounded-full border border-emerald-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-[#D4AF37]/15 rounded-xl animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Summary Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-4 border border-white/5 space-y-2 animate-pulse"
            >
              <div className="h-4 w-20 bg-white/10 rounded" />
              <div className="h-7 w-16 bg-white/15 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Search & Filters Skeleton */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3 animate-pulse">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="h-10 flex-1 bg-[#10131E] rounded-xl border border-white/5" />
            <div className="flex gap-2">
              <div className="h-10 w-20 bg-white/5 rounded-xl" />
              <div className="h-10 w-24 bg-white/5 rounded-xl" />
            </div>
          </div>
          <div className="flex gap-2 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-7 w-20 bg-white/5 rounded-xl shrink-0" />
            ))}
          </div>
        </div>

        {/* Inventory Cards Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col justify-between min-h-[195px] animate-pulse"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="w-16 h-5 bg-white/10 rounded-md" />
                  <div className="w-12 h-5 bg-white/10 rounded-md" />
                </div>
                <div className="w-4/5 h-5 bg-white/10 rounded mt-1" />
              </div>
              <div className="mt-3.5 pt-2.5 border-t border-white/5 space-y-2.5">
                <div className="h-8 bg-white/10 rounded-xl" />
                <div className="flex items-center justify-between px-1">
                  <div className="w-16 h-3 bg-white/10 rounded" />
                  <div className="w-12 h-4 bg-white/10 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-white/10 rounded-xl" />
                  <div className="w-8 h-8 bg-white/10 rounded-xl" />
                  <div className="w-8 h-8 bg-white/10 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
