'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // SW 기본 활성화: 정적 자산 캐싱으로 재방문 속도 대폭 향상
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        // 새 SW가 대기 중이면 즉시 활성화
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

        navigator.serviceWorker.addEventListener('controllerchange', () => {});
      })
      .catch(() => {});
  }, []);

  return null;
}
