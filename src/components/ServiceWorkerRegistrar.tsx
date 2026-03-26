'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const enableSW = process.env.NEXT_PUBLIC_ENABLE_SW === 'true';

    // 기본값: SW 비활성. 이전 버전 SW가 남아 있으면 해제해서 캐시 꼬임/오류를 방지
    if (!enableSW) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // 새 sw.js가 있으면 즉시 반영
        reg.update().catch(() => {});
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      })
      .catch(() => {});
  }, []);

  return null;
}
