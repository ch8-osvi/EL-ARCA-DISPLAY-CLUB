export default function PosLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-amber-500/10 rounded-full border border-amber-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 bg-emerald-500/10 rounded-xl border border-emerald-500/20 animate-pulse" />
          <div className="h-8 w-24 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </header>

      {/* Main 2-Column POS Layout Skeleton */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-w-0">
        {/* Left Column: Product Selection & Catalog (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col space-y-4 min-w-0">
          <div className="glass-panel rounded-2xl p-4 border border-white/10 space-y-3 animate-pulse">
            <div className="h-10 w-full bg-[#10131E] rounded-xl border border-white/5" />
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-7 w-20 bg-white/5 rounded-xl shrink-0" />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="glass-card rounded-2xl p-4 border border-white/5 flex flex-col justify-between min-h-[135px] animate-pulse"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="w-16 h-5 bg-white/10 rounded-md" />
                    <div className="w-12 h-5 bg-white/10 rounded-md" />
                  </div>
                  <div className="w-3/4 h-5 bg-white/10 rounded mt-1" />
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <div className="w-14 h-3 bg-white/10 rounded mb-1" />
                    <div className="w-20 h-5 bg-white/10 rounded mb-1" />
                    <div className="w-16 h-3 bg-white/10 rounded" />
                  </div>
                  <div className="w-20 h-8 bg-white/10 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Column: Cart & Checkout (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col min-w-0">
          <div className="glass-panel rounded-3xl p-5 border border-white/10 space-y-4 animate-pulse">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="h-6 w-32 bg-white/15 rounded-lg" />
              <div className="h-6 w-20 bg-white/10 rounded-full" />
            </div>
            <div className="h-10 w-full bg-[#10131E] rounded-xl border border-white/5" />
            <div className="space-y-3 py-6">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-14 w-full rounded-2xl bg-white/[0.03] border border-white/5"
                />
              ))}
            </div>
            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-20 bg-white/10 rounded" />
                <div className="h-5 w-24 bg-white/15 rounded" />
              </div>
              <div className="h-12 w-full bg-[#D4AF37]/20 rounded-2xl border border-[#D4AF37]/30 mt-4" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
