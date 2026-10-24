export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Top Navbar Skeleton */}
      <div className="w-full h-16 sm:h-20 bg-[#090A0F]/90 backdrop-blur-xl border-b border-[#D4AF37]/15 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-6 w-32 bg-white/10 rounded-lg animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-[#D4AF37]/15 rounded-xl animate-pulse" />
          <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Banner Skeleton */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/20 space-y-4 animate-pulse">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="h-6 w-44 bg-[#D4AF37]/20 rounded-full" />
              <div className="h-9 w-72 bg-white/15 rounded-xl" />
              <div className="h-4 w-96 max-w-full bg-white/10 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-28 bg-white/10 rounded-xl" />
              <div className="h-10 w-32 bg-emerald-500/20 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Currency & Quick Actions Toolbar */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-wrap items-center justify-between gap-4 animate-pulse">
          <div className="h-9 w-56 bg-emerald-500/10 rounded-xl border border-emerald-500/20" />
          <div className="flex gap-2">
            <div className="h-9 w-32 bg-white/5 rounded-xl" />
            <div className="h-9 w-32 bg-white/5 rounded-xl" />
          </div>
        </div>

        {/* Search & Brands Skeleton */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-4 animate-pulse">
          <div className="h-11 w-full bg-[#10131E] rounded-xl border border-white/5" />
          <div className="flex gap-2 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 w-24 bg-white/5 rounded-xl shrink-0" />
            ))}
          </div>
        </div>

        {/* Admin Products Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden animate-pulse border border-white/5 bg-white/[0.02]"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="h-6 w-16 bg-white/10 rounded-lg" />
                  <div className="h-5 w-20 bg-white/10 rounded-full" />
                </div>
                <div className="h-6 w-3/4 bg-white/10 rounded-lg mt-4" />
                <div className="h-4 w-1/2 bg-white/10 rounded-lg mt-2" />
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 w-12 bg-white/10 rounded" />
                  <div className="h-4 w-10 bg-white/10 rounded" />
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <div>
                    <div className="h-3 w-10 bg-white/10 rounded mb-1.5" />
                    <div className="h-7 w-16 bg-white/10 rounded-lg" />
                    <div className="h-2.5 w-14 bg-white/10 rounded mt-1" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-8 w-20 bg-white/10 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
