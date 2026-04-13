/**
 * PickMyAI Action Intent Token — Layer 11
 *
 * 서버 발급 일회용 토큰. 클라이언트는 절대 '비밀(Secret)'을 가지지 않는다.
 *
 * 흐름:
 *   1. 클라이언트가 실행 직전 /api/security/intent-token 호출
 *   2. 서버가 JIT 발급 (session_id, user_id, route, method, intent_type에 바인딩)
 *   3. 클라이언트가 실제 요청 시 토큰을 그대로 전달
 *   4. 서버 검증: 한 번만 사용 가능, 만료 체크, 파라미터 바인딩 일치 확인
 *
 * 점수:
 *   - 누락/만료: +30
 *   - 재사용(replay): +80
 *   - 파라미터 불일치: +80
 */

import crypto from 'crypto';

export interface IntentToken {
  id: string;
  userId: string;
  sessionId: string;
  route: string;
  method: string;
  intentType: string;
  boundParams: Record<string, unknown>;
  idempotencyKey: string;
  issuedAt: number;
  expiresAt: number;
  usedAt?: number;
}

// 인메모리 토큰 저장소
const tokenStore = new Map<string, IntentToken>();
const TOKEN_STORE_MAX = 100_000;
const DEFAULT_TTL_MS = 120_000; // 2분

function getTokenSecret(): string {
  return process.env.INTENT_TOKEN_SECRET || process.env.JWT_SECRET || 'pickmyai-intent-default';
}

/**
 * 토큰 ID 생성 (HMAC 서명 포함)
 */
function generateTokenId(userId: string, sessionId: string, nonce: string): string {
  const payload = `${userId}:${sessionId}:${nonce}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('hex');
  return `ait_${hmac.slice(0, 32)}`;
}

/**
 * 토큰 발급 (JIT — 실행 직전)
 */
export function issueToken(params: {
  userId: string;
  sessionId: string;
  route: string;
  method: string;
  intentType: string;
  boundParams?: Record<string, unknown>;
  ttlMs?: number;
}): IntentToken {
  const { userId, sessionId, route, method, intentType, boundParams = {}, ttlMs = DEFAULT_TTL_MS } = params;

  const nonce = crypto.randomBytes(16).toString('hex');
  const id = generateTokenId(userId, sessionId, nonce);
  const idempotencyKey = crypto.randomUUID();
  const now = Date.now();

  const token: IntentToken = {
    id,
    userId,
    sessionId,
    route,
    method,
    intentType,
    boundParams,
    idempotencyKey,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  // 저장소 용량 관리
  if (tokenStore.size >= TOKEN_STORE_MAX) {
    // 만료 토큰 먼저 정리
    for (const [k, t] of tokenStore) {
      if (t.expiresAt < now || t.usedAt) tokenStore.delete(k);
    }
    if (tokenStore.size >= TOKEN_STORE_MAX) {
      const oldest = tokenStore.keys().next().value;
      if (oldest !== undefined) tokenStore.delete(oldest);
    }
  }

  tokenStore.set(id, token);
  return token;
}

export type TokenVerifyResult =
  | { valid: true; token: IntentToken; idempotencyKey: string }
  | { valid: false; reason: 'missing' | 'expired' | 'replay' | 'param_mismatch' | 'session_mismatch' | 'not_found' };

/**
 * 토큰 검증 (한 번만 사용 가능)
 */
export function verifyToken(params: {
  tokenId: string;
  userId: string;
  sessionId: string;
  route: string;
  method: string;
  boundParams?: Record<string, unknown>;
}): TokenVerifyResult {
  const { tokenId, userId, sessionId, route, method, boundParams = {} } = params;

  if (!tokenId) {
    return { valid: false, reason: 'missing' };
  }

  const token = tokenStore.get(tokenId);
  if (!token) {
    return { valid: false, reason: 'not_found' };
  }

  const now = Date.now();

  // 만료 체크
  if (now > token.expiresAt) {
    tokenStore.delete(tokenId);
    return { valid: false, reason: 'expired' };
  }

  // Replay 체크
  if (token.usedAt) {
    return { valid: false, reason: 'replay' };
  }

  // 세션 바인딩 체크
  if (token.userId !== userId || token.sessionId !== sessionId) {
    return { valid: false, reason: 'session_mismatch' };
  }

  // 라우트/메서드 바인딩 체크
  if (token.route !== route || token.method !== method) {
    return { valid: false, reason: 'param_mismatch' };
  }

  // 파라미터 바인딩 체크 (바운드된 키만 비교)
  for (const [key, value] of Object.entries(token.boundParams)) {
    if (JSON.stringify(boundParams[key]) !== JSON.stringify(value)) {
      return { valid: false, reason: 'param_mismatch' };
    }
  }

  // 사용 처리 (1회용)
  token.usedAt = now;

  return { valid: true, token, idempotencyKey: token.idempotencyKey };
}

/**
 * 주기적 만료 토큰 정리
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [id, token] of tokenStore) {
    // 만료됐거나 사용 후 5분 지난 토큰 삭제
    if (token.expiresAt < now || (token.usedAt && now - token.usedAt > 5 * 60 * 1000)) {
      tokenStore.delete(id);
    }
  }
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__intentTokenCleanup === 'undefined') {
  (globalThis as any).__intentTokenCleanup = true;
  setInterval(cleanupExpiredTokens, 60_000);
}
