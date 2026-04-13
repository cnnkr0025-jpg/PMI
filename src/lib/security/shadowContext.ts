/**
 * PickMyAI Shadow Mode — 격리 컨텍스트 관리
 *
 * Shadow는 단순히 "가짜 응답"이 아니라 완전히 분리된 내부 격리 컨텍스트.
 *
 * 절대 금지:
 *   - 클라이언트가 x-shadow-mode 헤더로 Shadow 유도
 *   - 실제 DB 데이터 혼용
 *   - 실제 결제/웹훅/AI provider 호출
 *   - 실제 이메일/푸시/외부 알림 발송
 *
 * 필수 분리:
 *   - 세션 namespace
 *   - 캐시 namespace
 *   - 읽기 모델 / projection
 */

import crypto from 'crypto';

export interface ShadowState {
  /** Shadow 상태 여부 */
  active: boolean;
  /** 사용자 ID */
  userId: string;
  /** 세션 ID */
  sessionId: string;
  /** Shadow 진입 시점 */
  enteredAt: number;
  /** 진입 사유 */
  entryReasons: string[];
  /** 진입 시 점수 */
  entryScore: number;
  /** 감사 로그 correlation ID */
  auditCorrelationId: string;
  /** synthetic dataset seed (Layer 20) */
  syntheticSeed: number;
  /** HMAC 서명 (서버 전용 — 클라이언트에 노출 금지) */
  signature: string;
}

// 인메모리 Shadow 세션 저장소
const shadowSessions = new Map<string, ShadowState>();
const SHADOW_SESSION_MAX = 10_000;

function getShadowKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

function getSigningSecret(): string {
  return process.env.SHADOW_SIGNING_SECRET || process.env.JWT_SECRET || 'pickmyai-shadow-default-secret';
}

function signShadowState(state: Omit<ShadowState, 'signature'>): string {
  const payload = JSON.stringify({
    userId: state.userId,
    sessionId: state.sessionId,
    enteredAt: state.enteredAt,
    syntheticSeed: state.syntheticSeed,
  });
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
}

/**
 * Shadow 모드 진입
 */
export function enterShadow(params: {
  userId: string;
  sessionId: string;
  entryReasons: string[];
  entryScore: number;
  auditCorrelationId: string;
}): ShadowState {
  const { userId, sessionId, entryReasons, entryScore, auditCorrelationId } = params;
  const key = getShadowKey(userId, sessionId);

  // 이미 Shadow 상태면 기존 상태 반환
  const existing = shadowSessions.get(key);
  if (existing) return existing;

  // seed는 HMAC 기반 (DB 접근으로 판별 불가)
  const seedInput = `${userId}:${sessionId}:${getSigningSecret()}`;
  const seedHash = crypto.createHash('sha256').update(seedInput).digest();
  const syntheticSeed = seedHash.readUInt32BE(0);

  const state: Omit<ShadowState, 'signature'> = {
    active: true,
    userId,
    sessionId,
    enteredAt: Date.now(),
    entryReasons,
    entryScore,
    auditCorrelationId,
    syntheticSeed,
  };

  const fullState: ShadowState = {
    ...state,
    signature: signShadowState(state),
  };

  // 저장소 용량 관리
  if (shadowSessions.size >= SHADOW_SESSION_MAX) {
    const oldest = shadowSessions.keys().next().value;
    if (oldest !== undefined) shadowSessions.delete(oldest);
  }

  shadowSessions.set(key, fullState);
  return fullState;
}

/**
 * Shadow 상태 확인
 */
export function isShadowed(userId: string, sessionId: string): boolean {
  const key = getShadowKey(userId, sessionId);
  const state = shadowSessions.get(key);
  return !!state?.active;
}

/**
 * Shadow 상태 조회 (서버 내부용)
 */
export function getShadowState(userId: string, sessionId: string): ShadowState | null {
  const key = getShadowKey(userId, sessionId);
  return shadowSessions.get(key) || null;
}

/**
 * Shadow 해제 (운영자 수동)
 */
export function releaseShadow(userId: string, sessionId: string, reason: string): boolean {
  const key = getShadowKey(userId, sessionId);
  const state = shadowSessions.get(key);
  if (!state) return false;
  shadowSessions.delete(key);
  return true;
}

/**
 * 특정 userId에 대해 활성 Shadow 세션이 존재하는지 확인 (route handler용)
 *
 * 주의: 인메모리 기반이므로 단일 프로세스 환경(개발, 단일 인스턴스 서버)에서만
 * 완전히 신뢰 가능. 멀티 인스턴스/서버리스에서는 best-effort.
 * 완전한 서버리스 지원이 필요한 경우 shadow_sessions DB 조회로 전환 필요.
 */
export function isShadowedAny(userId: string): boolean {
  for (const state of shadowSessions.values()) {
    if (state.active && state.userId === userId) return true;
  }
  return false;
}

/**
 * userId에 대한 synthetic seed 반환 (Shadow 응답 생성용)
 * 활성 세션이 없으면 userId 기반 결정론적 seed fallback.
 */
export function getShadowSeedForUser(userId: string): number {
  for (const state of shadowSessions.values()) {
    if (state.active && state.userId === userId) return state.syntheticSeed;
  }
  let seed = 0;
  for (let i = 0; i < userId.length; i++) {
    seed = ((seed * 31) + userId.charCodeAt(i)) >>> 0;
  }
  return seed;
}

/**
 * Shadow 서명 검증 (내부 미들웨어용)
 */
export function verifyShadowSignature(state: ShadowState): boolean {
  const { signature, ...rest } = state;
  const expected = signShadowState(rest);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}

/**
 * 주기적 정리 (24시간 이상 된 Shadow 세션 제거)
 */
function cleanupShadowSessions(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, state] of shadowSessions) {
    if (state.enteredAt < cutoff) {
      shadowSessions.delete(key);
    }
  }
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__shadowCleanup === 'undefined') {
  (globalThis as any).__shadowCleanup = true;
  setInterval(cleanupShadowSessions, 10 * 60 * 1000);
}
