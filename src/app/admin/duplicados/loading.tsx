export default function DuplicadosLoading() {
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner Skeleton */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 animate-pulse">
          <div className="space-y-3 max-w-2xl">
            <div className="h-6 w-48 bg-[#D4AF37]/20 rounded-full" />
            <div className="h-8 w-72 bg-white/15 rounded-xl" />
            <div className="h-4 w-96 max-w-full bg-white/10 rounded-lg" />
          </div>
          <div className="flex gap-3">
            <div className="h-14 w-28 bg-white/5 rounded-2xl" />
            <div className="h-14 w-28 bg-white/5 rounded-2xl" />
          </div>
        </section>

        {/* Tab Selector Skeleton */}
        <div className="flex gap-3 border-b border-white/10 pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-36 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* Duplicate Pair Cards Skeleton */}
        <div className="grid grid-cols-1 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 border border-white/5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 animate-pulse"
            >
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-6 bg-white/10 rounded-lg" />
                  <div className="w-16 h-5 bg-white/10 rounded-lg" />
                  <div className="w-24 h-6 bg-white/10 rounded-lg" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white/5 space-y-2">
                    <div className="w-24 h-3 bg-white/10 rounded" />
                    <div className="w-3/4 h-5 bg-white/10 rounded mt-2 mb-4" />
                    <div className="flex justify-between pt-2 border-t border-white/5 mt-4">
                      <div className="w-16 h-3 bg-white/10 rounded" />
                      <div className="w-12 h-4 bg-white/10 rounded" />
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white/5 space-y-2">
                    <div className="w-24 h-3 bg-white/10 rounded" />
                    <div className="w-3/4 h-5 bg-white/10 rounded mt-2 mb-4" />
                    <div className="flex justify-between pt-2 border-t border-white/5 mt-4">
                      <div className="w-16 h-3 bg-white/10 rounded" />
                      <div className="w-12 h-4 bg-white/10 rounded" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0 w-full lg:w-48">
                <div className="w-full h-10 bg-white/10 rounded-xl" />
                <div className="w-full h-10 bg-white/10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
