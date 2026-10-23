'use client';
import { useEffect, useState } from 'react';
export function useActiveExchangeRate() {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const res = await fetch('/api/exchange-rate', { cache: 'no-store' });
        const data = await res.json();
        if (active) setRate(res.ok && data.success && Number.isFinite(data.rate) && data.rate >= 1 ? data.rate : null);
      } catch { if (active) setRate(null); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    const onStorage = (event: StorageEvent) => { if (event.key === 'el_arca_rate_updated') void refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('exchange-rate-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); window.removeEventListener('exchange-rate-changed', refresh); };
  }, []);
  return [rate, setRate] as const;
}
