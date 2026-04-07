import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import crypto from 'crypto';

type JWTKey = Awaited<ReturnType<typeof importPKCS8>>;

/**
 * 보안 강화된 인증 유틸리티
 * - RS256 (비대칭키) JWT + HS256 하위호환
 * - Access Token (15분) + Refresh Token (7일)
 * - Refresh Token Rotation (재발급 시 이전 토큰 무효화)
 * - 디바이스별 세션 관리
 * - 동시 로그인 제한
 */

// ── 상수 ──
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_SESSIONS_PER_USER = 5;

// ── 세션 블랙리스트 (프로덕션에서는 Redis/Supabase 사용 권장) ──
const sessionBlacklist = new Set<string>();
const SESSION_BLACKLIST_MAX = 10_000;

// ── Refresh Token 저장소 (프로덕션: Supabase refresh_tokens 테이블) ──
// { tokenHash → { userId, deviceId, familyId, usedAt? } }
const refreshTokenStore = new Map<string, {
  userId: string;
  deviceId: string;
  familyId: string;
  expiresAt: number;
  used: boolean;
}>();
const REFRESH_STORE_MAX = 50_000;

// ── 사용자별 세션 추적 (동시 로그인 제한) ──
const userSessions = new Map<string, Set<string>>(); // userId → Set<familyId>

// ── RSA 키 캐시 ──
let _rsaPrivateKey: JWTKey | null = null;
let _rsaPublicKey: JWTKey | null = null;
let _rsaKeysLoaded = false;

async function getRsaPrivateKey(): Promise<JWTKey | null> {
  if (_rsaKeysLoaded) return _rsaPrivateKey;
  await loadRsaKeys();
  return _rsaPrivateKey;
}

async function getRsaPublicKey(): Promise<JWTKey | null> {
  if (_rsaKeysLoaded) return _rsaPublicKey;
  await loadRsaKeys();
  return _rsaPublicKey;
}

async function loadRsaKeys(): Promise<void> {
  if (_rsaKeysLoaded) return;
  _rsaKeysLoaded = true;

  const rawPrivate = process.env.JWT_RSA_PRIVATE_KEY;
  const rawPublic = process.env.JWT_RSA_PUBLIC_KEY;

  if (rawPrivate) {
    try {
      const pem = rawPrivate.replace(/\\n/g, '\n');
      _rsaPrivateKey = await importPKCS8(pem, 'RS256');
    } catch {
      _rsaPrivateKey = null;
    }
  }
  if (rawPublic) {
    try {
      const pem = rawPublic.replace(/\\n/g, '\n');
      _rsaPublicKey = await importSPKI(pem, 'RS256');
    } catch {
      _rsaPublicKey = null;
    }
  }
}

function getHs256Key(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

function useRs256(): boolean {
  return !!(process.env.JWT_RSA_PRIVATE_KEY && process.env.JWT_RSA_PUBLIC_KEY);
}

// ── 유틸리티 ──

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
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 입력값 sanitization
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '').slice(0, 1000);
}

/**
 * 이메일 검증 (강화)
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email)) return false;
  if (email.length > 254) return false;
  return true;
}

/**
 * 비밀번호 검증 (타입 + 길이)
 */
export function isValidPassword(password: unknown): password is string {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 128) return false;
  return true;
}

/**
 * 이름 검증
 */
export function isValidName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const sanitized = sanitizeInput(name);
  if (sanitized.length < 2 || sanitized.length > 50) return false;
  return true;
}

// ── 토큰 생성 ──

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  jti: string;
  deviceId?: string;
  tokenType?: 'access' | 'refresh';
  familyId?: string;
}

/**
 * Access Token 생성 (15분, RS256 우선 / HS256 폴백)
 */
export async function createAccessToken(payload: {
  userId: string;
  email: string;
  name: string;
  deviceId?: string;
}): Promise<string> {
  const jti = crypto.randomBytes(16).toString('hex');
  const rsaKey = await getRsaPrivateKey();

  if (rsaKey && useRs256()) {
    return new SignJWT({ ...payload, jti, tokenType: 'access' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .setIssuer('pick-my-ai')
      .sign(rsaKey);
  }

  const hs256Key = getHs256Key();
  if (!hs256Key) throw new Error('JWT_SECRET 또는 JWT_RSA_PRIVATE_KEY가 설정되지 않았습니다.');

  return new SignJWT({ ...payload, jti, tokenType: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('pick-my-ai')
    .sign(hs256Key);
}

/**
 * Refresh Token 생성 (7일, RS256 우선 / HS256 폴백)
 * familyId로 토큰 패밀리 추적 → Rotation 시 이전 토큰 무효화
 */
export async function createRefreshToken(payload: {
  userId: string;
  email: string;
  name: string;
  deviceId?: string;
  familyId?: string;
}): Promise<{ token: string; familyId: string }> {
  const jti = crypto.randomBytes(16).toString('hex');
  const familyId = payload.familyId || crypto.randomBytes(16).toString('hex');
  const rsaKey = await getRsaPrivateKey();

  let token: string;
  if (rsaKey && useRs256()) {
    token = await new SignJWT({ ...payload, jti, tokenType: 'refresh', familyId })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(REFRESH_TOKEN_EXPIRY)
      .setIssuer('pick-my-ai')
      .sign(rsaKey);
  } else {
    const hs256Key = getHs256Key();
    if (!hs256Key) throw new Error('JWT_SECRET 또는 JWT_RSA_PRIVATE_KEY가 설정되지 않았습니다.');
    token = await new SignJWT({ ...payload, jti, tokenType: 'refresh', familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(REFRESH_TOKEN_EXPIRY)
      .setIssuer('pick-my-ai')
      .sign(hs256Key);
  }

  // Refresh Token 해시를 저장소에 등록
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (refreshTokenStore.size >= REFRESH_STORE_MAX) {
    const firstKey = refreshTokenStore.keys().next().value;
    if (firstKey !== undefined) refreshTokenStore.delete(firstKey);
  }
  refreshTokenStore.set(tokenHash, {
    userId: payload.userId,
    deviceId: payload.deviceId || 'unknown',
    familyId,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    used: false,
  });

  // 사용자별 세션 추적 (동시 로그인 제한)
  let sessions = userSessions.get(payload.userId);
  if (!sessions) {
    sessions = new Set();
    userSessions.set(payload.userId, sessions);
  }
  sessions.add(familyId);

  // 최대 세션 수 초과 시 가장 오래된 세션 제거
  if (sessions.size > MAX_SESSIONS_PER_USER) {
    const oldest = sessions.values().next().value;
    if (oldest !== undefined) {
      sessions.delete(oldest);
      invalidateTokenFamily(oldest);
    }
  }

  return { token, familyId };
}

/**
 * 하위호환 createSecureToken (기존 코드 호환)
 * Access Token을 반환 (기존 단일 토큰 방식과 호환)
 */
export async function createSecureToken(payload: {
  userId: string;
  email: string;
  name: string;
}): Promise<string> {
  return createAccessToken(payload);
}

// ── 토큰 검증 ──

/**
 * 토큰 검증 (RS256 우선, HS256 폴백 — 마이그레이션 호환)
 */
export async function verifySecureToken(token: string): Promise<{
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
  expired?: boolean;
}> {
  // RS256 시도
  const rsaPubKey = await getRsaPublicKey();
  if (rsaPubKey) {
    const result = await tryVerifyToken(token, rsaPubKey, 'RS256');
    if (result.valid) return result;
    // RS256 실패 + HS256 키가 있으면 폴백 시도
  }

  // HS256 폴백 (마이그레이션 기간 호환)
  const hs256Key = getHs256Key();
  if (hs256Key) {
    return tryVerifyToken(token, hs256Key, 'HS256');
  }

  return { valid: false, error: '서버 설정 오류: JWT 키가 없습니다.' };
}

async function tryVerifyToken(
  token: string,
  key: JWTKey | Uint8Array,
  alg: 'RS256' | 'HS256'
): Promise<{ valid: boolean; payload?: TokenPayload; error?: string; expired?: boolean }> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [alg] });
    const jti = (payload.jti || payload.jti) as string || '';

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
        deviceId: payload.deviceId as string | undefined,
        tokenType: payload.tokenType as 'access' | 'refresh' | undefined,
        familyId: payload.familyId as string | undefined,
      },
    };
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { valid: false, error: '세션이 만료되었습니다.', expired: true };
    }
    return { valid: false, error: '유효하지 않은 세션입니다.' };
  }
}

// ── Refresh Token Rotation ──

/**
 * Refresh Token으로 새 Access + Refresh Token 발급
 * Rotation: 사용된 refresh token은 즉시 무효화
 * 재사용 감지: 이미 사용된 토큰 재사용 시 전체 패밀리 무효화 (탈취 대응)
 */
export async function rotateRefreshToken(refreshToken: string): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}> {
  const verification = await verifySecureToken(refreshToken);
  if (!verification.valid || !verification.payload) {
    return { success: false, error: verification.error || '유효하지 않은 리프레시 토큰' };
  }

  const { userId, email, name, deviceId, familyId, tokenType } = verification.payload;

  if (tokenType !== 'refresh') {
    return { success: false, error: '리프레시 토큰이 아닙니다.' };
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = refreshTokenStore.get(tokenHash);

  if (!stored) {
    // 저장소에 없음 → 이미 무효화되었거나 알 수 없는 토큰
    if (familyId) invalidateTokenFamily(familyId);
    return { success: false, error: '리프레시 토큰이 무효화되었습니다.' };
  }

  // 재사용 감지 → 전체 패밀리 무효화 (토큰 탈취 대응)
  if (stored.used) {
    invalidateTokenFamily(stored.familyId);
    return { success: false, error: '토큰 재사용 감지: 모든 세션이 무효화되었습니다.' };
  }

  // 현재 토큰을 "사용됨"으로 마크
  stored.used = true;

  // 새 토큰 쌍 발급 (같은 familyId 유지)
  const newAccessToken = await createAccessToken({ userId, email, name, deviceId });
  const { token: newRefreshToken } = await createRefreshToken({
    userId, email, name, deviceId, familyId: stored.familyId,
  });

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

// ── 세션 관리 ──

/**
 * 세션 무효화 (로그아웃 시 사용)
 */
export function invalidateSession(jti: string): void {
  if (sessionBlacklist.size >= SESSION_BLACKLIST_MAX) {
    const oldest = sessionBlacklist.values().next().value;
    if (oldest !== undefined) sessionBlacklist.delete(oldest);
  }
  sessionBlacklist.add(jti);
  setTimeout(() => { sessionBlacklist.delete(jti); }, 24 * 60 * 60 * 1000);
}

/**
 * 토큰 패밀리 전체 무효화 (탈취 감지 시)
 */
export function invalidateTokenFamily(familyId: string): void {
  for (const [hash, entry] of refreshTokenStore) {
    if (entry.familyId === familyId) {
      refreshTokenStore.delete(hash);
    }
  }
}

/**
 * 사용자의 모든 세션 무효화 (비밀번호 변경, 계정 탈취 시)
 */
export function invalidateAllUserSessions(userId: string): void {
  const sessions = userSessions.get(userId);
  if (sessions) {
    for (const familyId of sessions) {
      invalidateTokenFamily(familyId);
    }
    sessions.clear();
  }

  // 블랙리스트에서 해당 사용자 관련 refresh token 모두 제거
  for (const [hash, entry] of refreshTokenStore) {
    if (entry.userId === userId) {
      refreshTokenStore.delete(hash);
    }
  }
}

/**
 * 사용자의 활성 세션 수 조회
 */
export function getUserSessionCount(userId: string): number {
  return userSessions.get(userId)?.size || 0;
}

/**
 * 특정 디바이스 세션 무효화
 */
export function invalidateDeviceSession(userId: string, deviceId: string): void {
  for (const [hash, entry] of refreshTokenStore) {
    if (entry.userId === userId && entry.deviceId === deviceId) {
      invalidateTokenFamily(entry.familyId);
      refreshTokenStore.delete(hash);
    }
  }
}

// ── IP / 요청 유틸리티 ──

/**
 * 안전한 클라이언트 IP 추출
 */
export function getSecureClientIp(request: NextRequest): string {
  const trustedProxies = ['vercel', 'netlify', 'cloudflare'];
  const host = request.headers.get('host') || '';
  const isTrustedProxy = trustedProxies.some(proxy =>
    host.includes(proxy) || process.env.TRUSTED_PROXY === proxy
  );

  if (isTrustedProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const ip = forwarded.split(',')[0].trim();
      if (isValidIp(ip)) return ip;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp && isValidIp(realIp)) return realIp;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp)) return cfIp;

  return 'unknown';
}

function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
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
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      return { success: false, error: '요청이 너무 큽니다.' };
    }
    const body = await request.json();
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
  if (!csrfToken || !cookieToken) return false;
  return secureCompare(csrfToken, cookieToken);
}

// ── 주기적 메모리 정리 ──
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__secureAuthCleanup === 'undefined') {
  (globalThis as any).__secureAuthCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [hash, entry] of refreshTokenStore) {
      if (now > entry.expiresAt) refreshTokenStore.delete(hash);
    }
  }, 10 * 60 * 1000); // 10분마다
}
