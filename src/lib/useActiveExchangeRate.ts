"use client";
import { useEffect, useState } from "react";
export function useActiveExchangeRate() {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const refresh = async () => {
      const current = ++version;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch("/api/exchange-rate", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (active && current === version)
          setRate(
            res.ok &&
              data.success &&
              Number.isFinite(data.rate) &&
              data.rate >= 1
              ? data.rate
              : null,
          );
      } catch {
        if (active && current === version) setRate(null);
      } finally {
        clearTimeout(timeout);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "el_arca_rate_updated") void refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    window.addEventListener("exchange-rate-changed", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("exchange-rate-changed", refresh);
    };
  }, []);
  return [rate, setRate] as const;
}
