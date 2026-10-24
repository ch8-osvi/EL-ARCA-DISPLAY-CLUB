export default function HistorialLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-blue-500/10 rounded-full border border-blue-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-white/10 rounded-xl animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-4 border border-white/5 space-y-2 animate-pulse"
            >
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-7 w-20 bg-white/15 rounded-lg" />
              <div className="h-3 w-16 bg-white/5 rounded" />
            </div>
          ))}
        </div>

        {/* Filter bar Skeleton */}
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex flex-col sm:flex-row gap-3 animate-pulse">
          <div className="h-10 flex-1 bg-[#10131E] rounded-xl border border-white/5" />
          <div className="flex gap-2">
            <div className="h-10 w-24 bg-white/5 rounded-xl" />
            <div className="h-10 w-28 bg-white/5 rounded-xl" />
          </div>
        </div>

        {/* Orders list Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse"
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-20 bg-blue-500/20 rounded-md" />
                  <div className="h-4 w-32 bg-white/10 rounded" />
                </div>
                <div className="h-4 w-48 bg-white/15 rounded" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-6 w-20 bg-emerald-500/15 rounded-lg" />
                <div className="h-8 w-8 bg-white/10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
