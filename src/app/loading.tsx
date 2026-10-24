export default function RootLoading() {
  return (
    <div className="min-h-screen bg-[#0A0D14] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Navbar Skeleton */}
      <div className="w-full h-16 sm:h-20 bg-[#0A0D14]/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-6 w-36 bg-white/10 rounded-lg animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-24 bg-white/5 rounded-xl border border-white/10 animate-pulse" />
          <div className="h-9 w-28 bg-[#D4AF37]/20 rounded-xl border border-[#D4AF37]/30 animate-pulse" />
        </div>
      </div>

      {/* Main Content Skeleton */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Banner Skeleton */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-[#D4AF37]/20 space-y-4 animate-pulse">
          <div className="h-6 w-44 bg-[#D4AF37]/20 rounded-full" />
          <div className="h-10 w-3/4 max-w-md bg-white/15 rounded-xl" />
          <div className="h-4 w-full max-w-xl bg-white/10 rounded-lg" />
        </div>

        {/* Filters Bar Skeleton */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-4 animate-pulse">
          <div className="h-11 w-full bg-[#10131E] rounded-xl border border-white/5" />
          <div className="flex gap-2 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 w-24 bg-white/5 rounded-xl shrink-0" />
            ))}
          </div>
        </div>

        {/* Catalog Grid Skeleton */}
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
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="h-6 w-20 bg-white/15 rounded-lg" />
                  <div className="h-3.5 w-16 bg-white/5 rounded" />
                </div>
                <div className="h-9 w-28 bg-emerald-500/10 border border-emerald-500/20 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
