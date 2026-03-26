// Pick-My-AI Service Worker
// 전략: 정적 JS/CSS 자산만 Cache-First, 페이지 HTML은 캐시 없음 (네트워크 직접 통신)
const CACHE_VERSION = 'pma-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

self.addEventListener('install', (event) => {
  // 정적 자산 프리캐싱 제거 — 불필요한 네트워크 요청 방지
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('pma-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 다른 오리진 요청은 패스스루
  if (url.origin !== self.location.origin) return;

  // POST/PUT/DELETE 등 변경 요청은 패스스루
  if (request.method !== 'GET') return;

  // HTML 페이지 요청: 캐시 없이 네트워크 직접 통신 (Next.js SSR 최신성 보장)
  if (request.headers.get('accept')?.includes('text/html')) return;

  // _next/static: Cache-First (content hash가 파일명에 포함 → 불변 자산)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }
});

// 로그아웃 시 캐시 전체 삭제
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_SESSION_CACHE' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
