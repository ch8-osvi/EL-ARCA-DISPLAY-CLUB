export default function WhatsAppLoading() {
  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans animate-pulse selection:bg-amber-500 selection:text-black">
      {/* Top Header Skeleton */}
      <header className="sticky top-0 z-40 bg-[#07090E]/90 backdrop-blur-xl border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="h-5 w-40 bg-white/10 rounded-lg" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-44 bg-emerald-500/10 rounded-full border border-emerald-500/20" />
            <div className="h-9 w-9 bg-white/5 rounded-xl border border-white/5" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero Section Banner Skeleton */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/20 space-y-4">
          <div className="h-6 w-60 bg-[#D4AF37]/15 rounded-full" />
          <div className="h-9 w-80 bg-white/15 rounded-xl" />
          <div className="h-4 w-full max-w-xl bg-white/10 rounded-lg" />
        </section>

        {/* 4 Metric Cards Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 border border-white/5 bg-white/[0.02] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-white/10 rounded" />
                <div className="w-8 h-8 rounded-xl bg-white/10" />
              </div>
              <div className="h-8 w-16 bg-white/15 rounded-lg" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>

        {/* Tabs Bar Skeleton */}
        <div className="flex gap-2 border-b border-white/10 pb-4">
          {[1, 2, 3, 4].map((t) => (
            <div key={t} className="h-10 w-32 bg-white/5 rounded-xl" />
          ))}
        </div>

        {/* Table / List Container Skeleton */}
        <div className="glass-panel rounded-3xl p-6 border border-white/5 bg-white/[0.02] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-10 w-72 bg-white/5 rounded-xl" />
            <div className="h-10 w-40 bg-white/5 rounded-xl" />
          </div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="h-16 w-full rounded-2xl bg-white/[0.03] border border-white/5 flex items-center px-4 justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-white/10 rounded" />
                    <div className="h-3 w-48 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="h-4 w-20 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
