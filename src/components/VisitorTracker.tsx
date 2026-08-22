'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Only track public pages, do not track admin actions to avoid polluting metrics
    if (pathname.startsWith('/admin')) return;

    try {
      // 1. Persistent Visitor ID (distinguishes unique devices/users)
      let vid = localStorage.getItem('el_arca_vid');
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        localStorage.setItem('el_arca_vid', vid);
      }

      // 2. Track visit once per path per session
      const sessionKey = `el_arca_trk_${pathname}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1');

        fetch('/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitorId: vid,
            page: pathname,
            referrer: typeof document !== 'undefined' ? document.referrer : '',
          }),
        }).catch(() => {
          // Silent catch
        });
      }
    } catch {
      // Silent catch
    }
  }, [pathname]);

  return null;
}
