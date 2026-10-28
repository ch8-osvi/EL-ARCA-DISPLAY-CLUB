"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const pendingVisits = new Set<string>();

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Only track public pages, do not track admin actions to avoid polluting metrics
    if (pathname.startsWith("/admin")) return;

    try {
      // 1. Persistent Visitor ID (distinguishes unique devices/users)
      let vid = localStorage.getItem("el_arca_vid");
      if (!vid) {
        vid =
          "v_" +
          Math.random().toString(36).substring(2, 11) +
          Date.now().toString(36);
        localStorage.setItem("el_arca_vid", vid);
      }

      // 2. Track visit once per path per session
      const sessionKey = `el_arca_trk_${pathname}`;
      if (
        sessionStorage.getItem(sessionKey) !== "1" &&
        !pendingVisits.has(sessionKey)
      ) {
        pendingVisits.add(sessionKey);

        fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitorId: vid,
            page: pathname,
            referrer: document.referrer.slice(0, 2048),
          }),
        })
          .then((res) => {
            if (res.ok) sessionStorage.setItem(sessionKey, "1");
          })
          .catch(() => {})
          .finally(() => {
            pendingVisits.delete(sessionKey);
          });
      }
    } catch {
      // Silent catch
    }
  }, [pathname]);

  return null;
}
