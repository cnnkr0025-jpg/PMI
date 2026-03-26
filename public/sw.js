// Pick-My-AI Service Worker v3
// 전략: JS/CSS = Cache-First, 폰트/이미지 = Stale-While-Revalidate, HTML = Network-First
const CACHE_VER = 'pma-v3';
const STATIC_CACHE = `${CACHE_VER}-static`;
const FONT_CACHE = `${CACHE_VER}-font`;
const ASSET_CACHE = `${CACHE_VER}-asset`;

const MAX_FONT_ENTRIES = 30;
const MAX_ASSET_ENTRIES = 50;

// ── 오래된 캐시 삭제 ──────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('pma-') && k !== STATIC_CACHE && k !== FONT_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── 캐시 크기 제한 (LRU 근사) ────────────────────────────────────────
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

// ── Fetch 핸들러 ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // ① _next/static — 파일명에 content-hash 포함 → Cache-First (불변 자산)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // ② 폰트 / 구글폰트 — Stale-While-Revalidate (FOUT 방지)
  if (
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.pathname.match(/\.(woff2?|ttf|otf|eot)$/)
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const networkRes = fetch(request).then((res) => {
          if (res.ok) {
            cache.put(request, res.clone());
            trimCache(FONT_CACHE, MAX_FONT_ENTRIES);
          }
          return res;
        });
        return hit || networkRes;
      })
    );
    return;
  }

  // ③ 정적 이미지 / 아이콘 — Cache-First with revalidation
  if (url.pathname.match(/\.(svg|png|jpg|jpeg|webp|avif|ico|gif)$/)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) {
          // 백그라운드 갱신
          fetch(request).then((res) => {
            if (res.ok) {
              cache.put(request, res);
              trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
            }
          }).catch(() => {});
          return hit;
        }
        const res = await fetch(request);
        if (res.ok) {
          cache.put(request, res.clone());
          trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
        }
        return res;
      })
    );
    return;
  }

  // ④ HTML 페이지 — Network-First (항상 최신 버전, 실패 시 캐시 폴백 없음)
  //    API 요청도 포함 — 절대 캐시 안 함
});

// ── 메시지 핸들러 ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_SESSION_CACHE') {
    // 정적 자산은 유지, 세션/API 관련 캐시만 삭제 (해당 없음)
    self.skipWaiting();
  }
});
