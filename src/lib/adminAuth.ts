import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_MAX_AGE_SECONDS,
  getAdminSecretPath,
  getRequestAdminPath,
  requestHasTrustedOrigin,
} from './serverSecurity';

const SECRET_KEY = process.env.ADMIN_JWT_SECRET || '';
if (!SECRET_KEY && typeof window === 'undefined') {
  console.warn('[SECURITY] ADMIN_JWT_SECRET is not set. Admin features will be unavailable. Do NOT share JWT_SECRET between app and admin.');
}

// 비밀번호 실패 추적 (IP 기반)
interface LoginAttempt {
  count: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();
const LOGIN_ATTEMPTS_MAX_SIZE = 50_000; // 메모리 기반 DoS 방지

// 설정
const MAX_ATTEMPTS = parseInt(process.env.ADMIN_MAX_ATTEMPTS || '5');
const LOCKOUT_DURATION = parseInt(process.env.ADMIN_LOCKOUT_DURATION || '1800000'); // 30분 (밀리초)

// IP별 로그인 시도 기록
export function recordLoginAttempt(ip: string, success: boolean): { allowed: boolean; remainingAttempts?: number; lockedUntil?: number } {
  const now = Date.now();
  let attempt = loginAttempts.get(ip);

  if (!attempt) {
    // Map 크기 한도 초과 시 가장 오래된 항목 제거
    if (loginAttempts.size >= LOGIN_ATTEMPTS_MAX_SIZE) {
      const firstKey = loginAttempts.keys().next().value;
      if (firstKey !== undefined) loginAttempts.delete(firstKey);
    }
    attempt = { count: 0, lockedUntil: null, lastAttempt: now };
    loginAttempts.set(ip, attempt);
  }

  // 잠금 확인
  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    return {
      allowed: false,
      lockedUntil: attempt.lockedUntil
    };
  }

  // 잠금 시간이 지났으면 초기화
  if (attempt.lockedUntil && now >= attempt.lockedUntil) {
    attempt.count = 0;
    attempt.lockedUntil = null;
  }

  if (success) {
    // 성공 시 초기화
    attempt.count = 0;
    attempt.lockedUntil = null;
    attempt.lastAttempt = now;
    return { allowed: true };
  } else {
    // 실패 시 카운트 증가
    attempt.count++;
    attempt.lastAttempt = now;

    if (attempt.count >= MAX_ATTEMPTS) {
      // 최대 시도 횟수 초과 - 잠금
      attempt.lockedUntil = now + LOCKOUT_DURATION;
      return {
        allowed: false,
        lockedUntil: attempt.lockedUntil
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - attempt.count
    };
  }
}

// IP 잠금 상태 확인
export function isIPLocked(ip: string): { locked: boolean; lockedUntil?: number } {
  const attempt = loginAttempts.get(ip);
  const now = Date.now();

  if (!attempt || !attempt.lockedUntil) {
    return { locked: false };
  }

  if (now < attempt.lockedUntil) {
    return { locked: true, lockedUntil: attempt.lockedUntil };
  }

  // 잠금 시간이 지났으면 초기화
  attempt.count = 0;
  attempt.lockedUntil = null;
  return { locked: false };
}

// 관리자 비밀번호 검증
export function verifyAdminPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || !SECRET_KEY || SECRET_KEY.length < 32) {
    return false;
  }

  const passwordBuffer = Buffer.from(password);
  const adminBuffer = Buffer.from(adminPassword);

  if (passwordBuffer.length !== adminBuffer.length) {
    const dummy = Buffer.alloc(Math.max(passwordBuffer.length, adminBuffer.length) || 1);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }

  return crypto.timingSafeEqual(passwordBuffer, adminBuffer);
}

function getAdminKey(): Uint8Array {
  if (!SECRET_KEY || SECRET_KEY.length < 32) {
    throw new Error('ADMIN_JWT_SECRET 또는 JWT_SECRET이 안전하게 설정되지 않았습니다.');
  }

  return new TextEncoder().encode(SECRET_KEY);
}

function createAdminFingerprint(userAgent: string, adminPath: string): string {
  return crypto
    .createHash('sha256')
    .update(`${userAgent}|${adminPath}`)
    .digest('hex');
}

export async function generateAdminToken(userAgent: string, adminPath: string): Promise<string> {
  const fingerprint = createAdminFingerprint(userAgent, adminPath);

  return new SignJWT({ role: 'admin', fingerprint })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('pick-my-ai-admin')
    .setAudience('pick-my-ai-admin')
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ADMIN_MAX_AGE_SECONDS}s`)
    .sign(getAdminKey());
}

export async function verifyAdminToken(token: string, userAgent: string, adminPath: string): Promise<boolean> {
  try {
    if (!token || !userAgent || !adminPath) {
      return false;
    }

    const { payload } = await jwtVerify(token, getAdminKey(), {
      algorithms: ['HS256'],
      issuer: 'pick-my-ai-admin',
      audience: 'pick-my-ai-admin',
    });

    const expectedFingerprint = createAdminFingerprint(userAgent, adminPath);
    const actualFingerprint = typeof payload.fingerprint === 'string' ? payload.fingerprint : '';

    if (!actualFingerprint || actualFingerprint.length !== expectedFingerprint.length) {
      return false;
    }

    return payload.role === 'admin' && crypto.timingSafeEqual(Buffer.from(actualFingerprint), Buffer.from(expectedFingerprint));
  } catch (error) {
    return false;
  }
}

export async function isAuthorizedAdminRequest(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const bearerToken = authHeader.slice(7).trim();
  const cookieToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value || '';
  const requestAdminPath = getRequestAdminPath(request);
  const secretPath = getAdminSecretPath();
  const userAgent = request.headers.get('user-agent') || 'unknown';

  if (!bearerToken || !cookieToken || !secretPath || requestAdminPath !== secretPath) {
    return false;
  }

  if (!requestHasTrustedOrigin(request)) {
    return false;
  }

  if (bearerToken.length !== cookieToken.length) {
    return false;
  }

  if (!crypto.timingSafeEqual(Buffer.from(bearerToken), Buffer.from(cookieToken))) {
    return false;
  }

  return verifyAdminToken(bearerToken, userAgent, requestAdminPath);
}

// 정리 작업 (1시간마다 오래된 데이터 삭제)
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  Array.from(loginAttempts.entries()).forEach(([ip, attempt]) => {
    if (now - attempt.lastAttempt > ONE_HOUR && (!attempt.lockedUntil || now > attempt.lockedUntil)) {
      loginAttempts.delete(ip);
    }
  });
}, 60 * 60 * 1000);
