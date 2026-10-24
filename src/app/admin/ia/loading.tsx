export default function IaLoading() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col font-sans selection:bg-[#D4AF37] selection:text-black">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-[#D4AF37]/15 backdrop-blur-xl bg-[#090A0F]/90 h-16 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 bg-white/10 rounded-lg animate-pulse" />
          <div className="h-6 w-36 bg-purple-500/10 rounded-full border border-purple-500/20 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-white/10 rounded-xl animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex flex-col">
        {/* Banner Skeleton */}
        <div className="glass-panel rounded-3xl p-6 border border-purple-500/20 space-y-3 animate-pulse">
          <div className="h-6 w-40 bg-purple-500/20 rounded-full" />
          <div className="h-8 w-64 bg-white/15 rounded-xl" />
          <div className="h-4 w-80 max-w-full bg-white/10 rounded-lg" />
        </div>

        {/* Chat / Terminal Window Skeleton */}
        <div className="glass-panel rounded-3xl p-6 border border-white/10 flex-1 min-h-[420px] flex flex-col justify-between space-y-6 animate-pulse">
          <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 shrink-0" />
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2 max-w-lg">
                <div className="h-4 w-48 bg-white/15 rounded" />
                <div className="h-3 w-64 bg-white/10 rounded" />
              </div>
            </div>
          </div>

          {/* Prompt Input Skeleton */}
          <div className="h-14 w-full bg-[#10131E] rounded-2xl border border-white/10 flex items-center px-4 justify-between">
            <div className="h-4 w-56 bg-white/10 rounded" />
            <div className="h-8 w-8 bg-purple-500/30 rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );
}
