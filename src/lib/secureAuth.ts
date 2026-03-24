import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

/**
 * 보안 강화된 인증 유틸리티
 */

// 세션 블랙리스트 (프로덕션에서는 Redis 사용 권장)
const sessionBlacklist = new Set<string>();
const SESSION_BLACKLIST_MAX = 5_000;

/**
 * 안전한 문자열 비교 (타이밍 공격 방지)
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    // 길이가 다르면 dummy 비교로 일정한 시간 소요
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 입력값 sanitization
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/[<>]/g, '') // 기본 XSS 방지
    .slice(0, 1000); // 최대 길이 제한
}

/**
 * 이메일 검증 (강화)
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) {
    return false;
  }
  
  // 최대 길이 검증
  if (email.length > 254) {
    return false;
  }
  
  return true;
}

/**
 * 비밀번호 검증 (타입 + 길이)
 */
export function isValidPassword(password: unknown): password is string {
  if (typeof password !== 'string') {
    return false;
  }
  
  // 최소 8자, 최대 128자
  if (password.length < 8 || password.length > 128) {
    return false;
  }
  
  return true;
}

/**
 * 이름 검증
 */
export function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false;
  }
  
  const sanitized = sanitizeInput(name);
  
  // 최소 2자, 최대 50자
  if (sanitized.length < 2 || sanitized.length > 50) {
    return false;
  }
  
  return true;
}

/**
 * 보안 강화된 JWT 생성
 */
export async function createSecureToken(payload: {
  userId: string;
  email: string;
  name: string;
}): Promise<string> {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET이 설정되지 않았습니다.');
  }
  
  // Secret 최소 길이 검증 (256bit = 32자)
  if (secret.length < 32) {
    throw new Error('JWT_SECRET은 최소 32자 이상이어야 합니다.');
  }
  
  // jti (JWT ID) 추가로 토큰 고유 식별
  const jti = crypto.randomBytes(16).toString('hex');
  
  const key = new TextEncoder().encode(secret);
  
  const token = await new SignJWT({
    ...payload,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
  
  return token;
}

/**
 * 보안 강화된 JWT 검증
 */
export async function verifySecureToken(token: string): Promise<{
  valid: boolean;
  payload?: {
    userId: string;
    email: string;
    name: string;
    jti: string;
  };
  error?: string;
}> {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    return { valid: false, error: '서버 설정 오류' };
  }
  
  try {
    const key = new TextEncoder().encode(secret);
    
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    
    const jti = payload.jti as string;
    
    // 블랙리스트 확인
    if (jti && sessionBlacklist.has(jti)) {
      return { valid: false, error: '무효화된 세션입니다.' };
    }
    
    return {
      valid: true,
      payload: {
        userId: payload.userId as string,
        email: payload.email as string,
        name: payload.name as string,
        jti,
      },
    };
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { valid: false, error: '세션이 만료되었습니다.' };
    }
    return { valid: false, error: '유효하지 않은 세션입니다.' };
  }
}

/**
 * 세션 무효화 (로그아웃 시 사용)
 */
export function invalidateSession(jti: string): void {
  // 크기 한도 초과 시 가장 오래된 항목 제거 (FIFO)
  if (sessionBlacklist.size >= SESSION_BLACKLIST_MAX) {
    const oldest = sessionBlacklist.values().next().value;
    if (oldest !== undefined) sessionBlacklist.delete(oldest);
  }
  sessionBlacklist.add(jti);

  // 24시간 후 자동 제거 (메모리 관리)
  setTimeout(() => {
    sessionBlacklist.delete(jti);
  }, 24 * 60 * 60 * 1000);
}

/**
 * 안전한 클라이언트 IP 추출
 */
export function getSecureClientIp(request: NextRequest): string {
  // 신뢰할 수 있는 프록시만 X-Forwarded-For 사용
  // Vercel, Netlify 등 신뢰할 수 있는 환경에서만 헤더 사용
  const trustedProxies = ['vercel', 'netlify', 'cloudflare'];
  const host = request.headers.get('host') || '';
  
  const isTrustedProxy = trustedProxies.some(proxy => 
    host.includes(proxy) || process.env.TRUSTED_PROXY === proxy
  );
  
  if (isTrustedProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      // 첫 번째 IP만 사용 (가장 원본에 가까움)
      const ip = forwarded.split(',')[0].trim();
      // IP 형식 검증
      if (isValidIp(ip)) {
        return ip;
      }
    }
    
    const realIp = request.headers.get('x-real-ip');
    if (realIp && isValidIp(realIp)) {
      return realIp;
    }
  }
  
  // Cloudflare의 경우
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }
  
  return 'unknown';
}

/**
 * IP 주소 형식 검증
 */
function isValidIp(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 (간단한 검증)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * 요청 본문 안전하게 파싱
 */
export async function safeParseJson(request: NextRequest): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const contentType = request.headers.get('content-type');
    
    if (!contentType?.includes('application/json')) {
      return { success: false, error: '잘못된 요청 형식입니다.' };
    }
    
    // 요청 크기 제한 (1MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return { success: false, error: '요청이 너무 큽니다.' };
    }
    
    const body = await request.json();
    
    // 객체인지 확인
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { success: false, error: '잘못된 요청 형식입니다.' };
    }
    
    return { success: true, data: body };
  } catch {
    return { success: false, error: '요청을 파싱할 수 없습니다.' };
  }
}

/**
 * 보안 강화된 CSRF 토큰 검증
 */
export function verifySecureCsrfToken(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');
  const cookieToken = request.cookies.get('csrf-token')?.value;
  
  if (!csrfToken || !cookieToken) {
    return false;
  }
  
  // 타이밍 공격 방지를 위한 안전한 비교
  return secureCompare(csrfToken, cookieToken);
}
