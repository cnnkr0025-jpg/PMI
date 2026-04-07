import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';

// ── Edge Runtime 호환 인라인 유틸리티 ──

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// ── RS256 공개키 캐시 (Edge Runtime 호환) ──
let _rsaPublicKeyCached: CryptoKey | null = null;
let _rsaKeyAttempted = false;

async function getRsaPublicKey(): Promise<CryptoKey | null> {
  if (_rsaKeyAttempted) return _rsaPublicKeyCached;
  _rsaKeyAttempted = true;
  const raw = process.env.JWT_RSA_PUBLIC_KEY;
  if (!raw) return null;
  try {
    const pem = raw.replace(/\\n/g, '\n');
    _rsaPublicKeyCached = await importSPKI(pem, 'RS256') as CryptoKey;
    return _rsaPublicKeyCached;
  } catch {
    return null;
  }
}

// ── Sliding Window Rate Limit (IP + UserID 복합키) ──
const slidingWindowMap = new Map<string, number[]>();
const SW_WINDOW_MS = 60_000; // 1분
const SW_MAX_REQUESTS = 80;
const SW_MAP_MAX = 30_000;

function slidingWindowCheck(key: string): boolean {
  const now = Date.now();
  let timestamps = slidingWindowMap.get(key);
  if (!timestamps) {
    if (slidingWindowMap.size >= SW_MAP_MAX) {
      const fk = slidingWindowMap.keys().next().value;
      if (fk !== undefined) slidingWindowMap.delete(fk);
    }
    slidingWindowMap.set(key, [now]);
    return false;
  }
  // 윈도우 밖 제거
  timestamps = timestamps.filter(t => now - t < SW_WINDOW_MS);
  timestamps.push(now);
  slidingWindowMap.set(key, timestamps);
  return timestamps.length > SW_MAX_REQUESTS;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    // optional chaining을 [0]까지 연장 — x-forwarded-for가 null일 때 TypeError 방지
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// ── 인메모리 IP 카운터 (Rate Limit) ──
const ipHits = new Map<string, { count: number; ts: number }>();
const IP_RATE_LIMIT = 80; // 1분 내 최대 요청 수 (100 → 80)
const IP_MAP_MAX_SIZE = 10_000;
let ipHitsCleanupCounter = 0;

function cleanupIpHits(now: number): void {
  for (const [ip, record] of ipHits) {
    if (now - record.ts > 60_000) ipHits.delete(ip);
  }
}

function isIPAbusive(ip: string): boolean {
  const now = Date.now();
  if (++ipHitsCleanupCounter >= 500) {
    ipHitsCleanupCounter = 0;
    cleanupIpHits(now);
  }
  const record = ipHits.get(ip);
  if (!record || now - record.ts > 60_000) {
    if (!record && ipHits.size >= IP_MAP_MAX_SIZE) {
      const firstKey = ipHits.keys().next().value;
      if (firstKey !== undefined) ipHits.delete(firstKey);
    }
    ipHits.set(ip, { count: 1, ts: now });
    return false;
  }
  record.count++;
  return record.count > IP_RATE_LIMIT;
}

// ── 버스트 탐지 (2초 내 과도한 요청) ──
const burstMap = new Map<string, number[]>();
const BURST_WINDOW_MS = 2_000;
const BURST_MAX = 15;
const BURST_MAP_MAX = 20_000;

function isBurstRequest(ip: string): boolean {
  const now = Date.now();
  let ts = burstMap.get(ip);
  if (!ts) {
    if (burstMap.size >= BURST_MAP_MAX) {
      const fk = burstMap.keys().next().value;
      if (fk !== undefined) burstMap.delete(fk);
    }
    burstMap.set(ip, [now]);
    return false;
  }
  ts = ts.filter((t) => now - t < BURST_WINDOW_MS);
  ts.push(now);
  burstMap.set(ip, ts);
  return ts.length > BURST_MAX;
}

// ── 허니팟 IP 블랙리스트 (24h 자동 차단) ──
const honeypotBanMap = new Map<string, number>();
const HONEYPOT_BAN_DURATION = 24 * 60 * 60 * 1000;
const HONEYPOT_BAN_MAX = 50_000;

function banIp(ip: string): void {
  if (honeypotBanMap.size >= HONEYPOT_BAN_MAX) {
    const fk = honeypotBanMap.keys().next().value;
    if (fk !== undefined) honeypotBanMap.delete(fk);
  }
  honeypotBanMap.set(ip, Date.now() + HONEYPOT_BAN_DURATION);
}

function isIpBanned(ip: string): boolean {
  const exp = honeypotBanMap.get(ip);
  if (!exp) return false;
  if (Date.now() > exp) { honeypotBanMap.delete(ip); return false; }
  return true;
}

// ── 허니팟 경로 ──
const HONEYPOT_PATHS = new Set([
  '/.env', '/.env.local', '/.env.production', '/.git', '/.git/config', '/.git/HEAD',
  '/.svn', '/.htaccess', '/.htpasswd', '/wp-admin', '/wp-login.php', '/wp-content',
  '/administrator', '/phpmyadmin', '/phpinfo.php', '/server-status', '/server-info',
  '/cgi-bin', '/config.php', '/config.yml', '/config.json', '/database.yml',
  '/docker-compose.yml', '/Dockerfile', '/.aws/credentials', '/.ssh/id_rsa',
  '/etc/passwd', '/etc/shadow', '/proc/self/environ', '/actuator', '/graphql',
  '/console', '/xmlrpc.php', '/backup.sql', '/dump.sql', '/db.sql', '/web.config',
]);

const HONEYPOT_PATTERNS = [
  /\/\.(env|git|svn|htaccess|htpasswd|aws|ssh|docker)/i,
  /\/(wp-|wordpress|joomla|drupal)/i,
  /\/(phpmyadmin|adminer|phpinfo)/i,
  /\/(backup|dump|export|db)\.(sql|zip|tar|gz|bak)/i,
  /\/(config|settings|credentials)\.(php|yml|yaml|json|xml|ini)/i,
];

function isHoneypotPath(p: string): boolean {
  const n = p.toLowerCase().replace(/\/+/g, '/');
  if (HONEYPOT_PATHS.has(n)) return true;
  return HONEYPOT_PATTERNS.some((r) => r.test(n));
}

// ── 악성 User-Agent 탐지 ──
const MALICIOUS_UA_PATTERNS = [
  /sqlmap/i, /nikto/i, /nmap/i, /masscan/i, /zgrab/i, /gobuster/i, /dirbuster/i,
  /wpscan/i, /nuclei/i, /httpx/i, /ffuf/i, /feroxbuster/i, /burpsuite/i,
  /acunetix/i, /nessus/i, /openvas/i, /w3af/i, /arachni/i, /havij/i, /metasploit/i,
  /hydra/i, /medusa/i,
];

function isMaliciousUA(ua: string | null): boolean {
  if (!ua || ua.length > 1000) return true;
  return MALICIOUS_UA_PATTERNS.some((p) => p.test(ua));
}

// ── 경로 순회 / 널 바이트 탐지 ──
function hasPathTraversal(p: string): boolean {
  return /(\.\.[/\\]|%2e%2e[/\\%]|%252e%252e)/i.test(p);
}
function hasNullByte(p: string): boolean {
  return p.includes('\0') || /%00/i.test(p);
}

// ── 서버 정보 은닉 (next.config.js headers()로 보안헤더 처리, 미들웨어는 서버 식별자만 제거) ──
function stripServerHeaders(response: NextResponse): NextResponse {
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  return response;
}

// ── 미들웨어 본체 ──

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);
  try {

  // ① 이미 차단된 IP (허니팟 블랙리스트)
  if (isIpBanned(clientIp)) {
    return new NextResponse(null, { status: 403 });
  }

  // ② 경로 순회 / 널 바이트 공격 차단
  if (hasPathTraversal(pathname) || hasNullByte(pathname)) {
    banIp(clientIp);
    return new NextResponse(null, { status: 400 });
  }

  // ③ 허니팟 경로 탐지 → IP 즉시 24시간 차단
  if (isHoneypotPath(pathname)) {
    banIp(clientIp);
    // 의도적으로 지연 응답 (공격 도구 속도 저하)
    return new NextResponse(null, { status: 404 });
  }

  // 홈: Edge에서 즉시 분기 — `/` RSC·cookies() 처리 없이 리다이렉트만 (첫 방문 체감 속도)
  if (pathname === '/' || pathname === '') {
    const hasSession = Boolean(request.cookies.get('session')?.value);
    const url = request.nextUrl.clone();
    url.pathname = hasSession ? '/chat' : '/guide';
    return stripServerHeaders(NextResponse.redirect(url));
  }

  // 보호된 경로 정의 (악성 UA / 버스트 체크 전에 먼저 일반 경로 조기 반환)
  const protectedPaths = ['/chat', '/dashboard', '/settings', '/configurator', '/checkout', '/feedback'];
  const isProtectedPath = protectedPaths.some(p => pathname.startsWith(p));
  const isApiPath = pathname.startsWith('/api/');

  if (!isProtectedPath && !isApiPath) {
    return NextResponse.next();
  }

  // ④ 악성 User-Agent 차단 (API 경로에서만 — 정상 브라우저는 통과)
  if (isApiPath) {
    const ua = request.headers.get('user-agent');
    if (isMaliciousUA(ua)) {
      return NextResponse.json({ error: '요청이 거부되었습니다.' }, { status: 403 });
    }
  }

  // ⑤ 버스트 요청 탐지 (2초 내 15개 이상) — 보호 경로/API에만 적용
  if (isBurstRequest(clientIp)) {
    return NextResponse.json({ error: '요청 속도가 너무 빠릅니다.' }, { status: 429 });
  }

  // 보호된 경로에 대한 세션 검증 (RS256 우선, HS256 폴백)
  let sessionUserId: string | undefined;
  if (isProtectedPath) {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    let verified = false;

    // RS256 시도
    const rsaPubKey = await getRsaPublicKey();
    if (rsaPubKey) {
      try {
        const { payload } = await jwtVerify(sessionToken, rsaPubKey, { algorithms: ['RS256'] });
        verified = true;
        sessionUserId = payload.userId as string;
      } catch {}
    }

    // HS256 폴백
    if (!verified) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
          return NextResponse.redirect(new URL('/login', request.url));
        }
        const key = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(sessionToken, key, { algorithms: ['HS256'] });
        verified = true;
        sessionUserId = payload.userId as string;
      } catch {}
    }

    if (!verified) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // ⑥ Sliding Window Rate Limit (IP + UserID 복합키)
  const rateLimitKey = sessionUserId ? `${clientIp}:${sessionUserId}` : clientIp;
  if (slidingWindowCheck(rateLimitKey)) {
    return NextResponse.json(
      { error: '비정상적인 요청 패턴이 감지되었습니다.' },
      { status: 429 }
    );
  }
  if (isIPAbusive(clientIp)) {
    return NextResponse.json(
      { error: '비정상적인 요청 패턴이 감지되었습니다.' },
      { status: 429 }
    );
  }

  // ── 요청 헤더 & CSRF ──
  const requestHeaders = new Headers(request.headers);
  const existingCsrfToken = request.cookies.get('csrf-token')?.value;
  const csrfTokenForThisRequest = existingCsrfToken || generateCsrfToken();
  requestHeaders.set('x-middleware-csrf-token', csrfTokenForThisRequest);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // CSRF 검증 (상태 변경 메서드 + API 라우트)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && isApiPath) {
    // /api/chat은 CSRF 예외에서 제거 — 세션 쿠키 + Origin 검증으로 보호
    const publicEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/social-session'];
    const isPublicEndpoint = publicEndpoints.some(ep => pathname.startsWith(ep));

    if (!isPublicEndpoint) {
      // same-origin 요청은 Origin/Referer 검증으로 통과
      const expectedOrigin = request.nextUrl.origin;
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');

      const isSameOrigin =
        (origin && origin === expectedOrigin) ||
        (referer && referer.startsWith(expectedOrigin));

      if (!isSameOrigin) {
        const csrfCookie = request.cookies.get('csrf-token');
        const csrfHeader = request.headers.get('x-csrf-token');

        if (!csrfCookie || !csrfHeader) {
          return NextResponse.json({ error: '요청이 유효하지 않습니다.' }, { status: 403 });
        }

        const cookieValue = csrfCookie.value;
        const headerValue = csrfHeader;

        // 고정 길이(64자)로 패딩 후 상수 시간 비교
        const EXPECTED_LEN = 64;
        const cv = cookieValue.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
        const hv = headerValue.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
        let mismatch = cookieValue.length !== EXPECTED_LEN ? 1 : 0;
        mismatch |= headerValue.length !== EXPECTED_LEN ? 1 : 0;
        for (let i = 0; i < EXPECTED_LEN; i++) {
          mismatch |= cv.charCodeAt(i) ^ hv.charCodeAt(i);
        }
        if (mismatch !== 0) {
          return NextResponse.json({ error: '요청이 유효하지 않습니다.' }, { status: 403 });
        }
      }
    }
  }

  // CSRF 토큰이 없으면 생성
  if (!existingCsrfToken) {
    response.cookies.set('csrf-token', csrfTokenForThisRequest, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
    });
  }

  return stripServerHeaders(response);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Middleware] Unexpected error:', error);
    }

    // 미들웨어 오류로 사이트 전체가 500이 되는 상황 방지
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'ERR_MW_00', reason: 'Middleware failure' }, { status: 500 });
    }

    return NextResponse.next();
  }
}

// Middleware가 실행될 경로 설정
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
