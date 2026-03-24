import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// ── Edge Runtime 호환 인라인 유틸리티 ──

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// 간단한 인메모리 IP 카운터 (Edge Function 인스턴스 수명 동안만 유지)
const ipHits = new Map<string, { count: number; ts: number }>();
const IP_RATE_LIMIT = 100; // 1분 내 최대 요청 수
const IP_MAP_MAX_SIZE = 10_000; // 최대 추적 IP 수 (메모리 DoS 방지)
let ipHitsCleanupCounter = 0;

function cleanupIpHits(now: number): void {
  for (const [ip, record] of ipHits) {
    if (now - record.ts > 60_000) ipHits.delete(ip);
  }
}

function isIPAbusive(ip: string): boolean {
  const now = Date.now();

  // 주기적 정리 (500 요청마다, 오래된 항목 제거)
  if (++ipHitsCleanupCounter >= 500) {
    ipHitsCleanupCounter = 0;
    cleanupIpHits(now);
  }

  const record = ipHits.get(ip);

  if (!record || now - record.ts > 60_000) {
    // Map 크기 한도 초과 시 추가 거부 대신 최소 제거 후 삽입
    if (!record && ipHits.size >= IP_MAP_MAX_SIZE) {
      const firstKey = ipHits.keys().next().value;
      if (firstKey !== undefined) ipHits.delete(firstKey);
    }
    ipHits.set(ip, { count: 1, ts: now });
    return false;
  }

  record.count++;
  if (record.count > IP_RATE_LIMIT) return true;
  return false;
}

// ── 미들웨어 본체 ──

function setSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 보호된 경로 정의
  const protectedPaths = ['/chat', '/dashboard', '/settings', '/configurator', '/checkout', '/feedback'];
  const isProtectedPath = protectedPaths.some(p => pathname.startsWith(p));
  const isApiPath = pathname.startsWith('/api/');

  if (!isProtectedPath && !isApiPath) {
    return setSecurityHeaders(NextResponse.next());
  }

  // 보호된 경로에 대한 세션 검증
  if (isProtectedPath) {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret.length < 32) {
        return NextResponse.redirect(new URL('/login', request.url));
      }

      const key = new TextEncoder().encode(secret);
      await jwtVerify(sessionToken, key, { algorithms: ['HS256'] });
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // IP 남용 체크
  const clientIp = getClientIp(request);
  if (isIPAbusive(clientIp)) {
    return NextResponse.json(
      { error: '비정상적인 요청 패턴이 감지되었습니다.' },
      { status: 403 }
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
    const publicEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/social-session', '/api/chat'];
    const isPublicEndpoint = publicEndpoints.some(ep => pathname.startsWith(ep));

    if (!isPublicEndpoint) {
      // same-origin 요청은 Origin/Referer 검증으로 통과 (브라우저가 httpOnly 쿠키를 읽을 수 없어
      // x-csrf-token 헤더를 만들 수 없기 때문)
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

        // 고정 길이(64자)로 패딩 후 상수 시간 비교 — 길이 정보를 노출하지 않음
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

  return setSecurityHeaders(response);
}

// Middleware가 실행될 경로 설정
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
