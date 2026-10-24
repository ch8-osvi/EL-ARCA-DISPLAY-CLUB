export default function OcultosLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-rose-500/10 rounded-full border border-rose-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-white/10 rounded-xl animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Banner Skeleton */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-rose-500/20 space-y-3 animate-pulse">
          <div className="h-6 w-44 bg-rose-500/20 rounded-full" />
          <div className="h-8 w-64 bg-white/15 rounded-xl" />
          <div className="h-4 w-96 max-w-full bg-white/10 rounded-lg" />
        </div>

        {/* Search bar Skeleton */}
        <div className="h-11 w-full bg-[#10131E] rounded-xl border border-white/5 animate-pulse" />

        {/* Hidden Products Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-4 border border-rose-500/10 flex flex-col gap-3 animate-pulse min-h-[160px]"
            >
              <div className="flex items-center justify-between">
                <div className="w-16 h-5 bg-rose-500/20 rounded-full" />
                <div className="w-10 h-3 bg-white/10 rounded" />
              </div>
              <div className="flex-1 mt-2">
                <div className="w-14 h-3 bg-[#D4AF37]/30 rounded block mb-2" />
                <div className="w-3/4 h-5 bg-white/10 rounded" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="w-16 h-5 bg-white/10 rounded-lg" />
                <div className="w-12 h-5 bg-white/10 rounded" />
              </div>
              <div className="h-8 bg-emerald-500/10 rounded-xl w-full mt-2" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
