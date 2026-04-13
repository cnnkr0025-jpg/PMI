/**
 * PickMyAI Production-Grade Multi-Dimensional Risk Engine
 *
 * 핵심 원칙:
 *   - 약한 신호 하나로 Shadow 전환 불가
 *   - IP 신호만으로 인증 사용자 Shadow 금지
 *   - 클라이언트 측 신호만으로 Freeze 금지
 *   - 동일 요청 내 중복 점수 가산 금지
 *   - 동일 계열(family) 신호는 family cap 적용
 *   - 모든 판단은 감사 로그로 재구성 가능해야 함
 */

import type {
  RiskSignal,
  RiskScope,
  RiskCategory,
  RiskContext,
  RiskDecision,
  RiskDecisionResult,
  ShadowQualification,
  SignalStrength,
  LegacyRiskResult,
  LegacyRiskLevel,
  LegacyRiskAction,
} from './riskTypes';
import { SCOPE_DEFAULT_TTL, THRESHOLDS, FAMILY_CAPS } from './riskTypes';

// ── 인메모리 상태 (세션/디바이스/IP/계정 스코프용) ──

interface StoredSignal extends RiskSignal {
  addedAt: number;
  expiresAt: number;
}

/** 키 = userId || sessionId || ip || deviceHash */
const signalStore = new Map<string, StoredSignal[]>();
const STORE_MAX_KEYS = 100_000;
const STORE_MAX_SIGNALS_PER_KEY = 50;

/** Challenge 실패 기록 */
const challengeFailures = new Map<string, number>();
const CHALLENGE_FAILURE_MAX = 50_000;

// ── 유틸리티 ──

function storeKey(ctx: RiskContext, scope: RiskScope): string {
  switch (scope) {
    case 'request_risk': return `req:${ctx.ip}:${Date.now()}`; // 요청 단위 (휘발)
    case 'session_risk': return `ses:${ctx.sessionId || ctx.ip}`;
    case 'device_risk': return `dev:${ctx.deviceHash || ctx.ip}`;
    case 'ip_risk': return `ip:${ctx.ip}`;
    case 'account_risk': return `acc:${ctx.userId || ctx.ip}`;
    case 'asset_integrity_risk': return `asset:${ctx.userId || ctx.ip}`;
  }
}

function evictOldestKey(): void {
  if (signalStore.size < STORE_MAX_KEYS) return;
  const firstKey = signalStore.keys().next().value;
  if (firstKey !== undefined) signalStore.delete(firstKey);
}

function pruneExpired(signals: StoredSignal[], now: number): StoredSignal[] {
  return signals.filter(s => s.expiresAt > now || s.expiresAt === Infinity);
}

// ── 외부 API: 신호 추가 ──

export function addSignal(ctx: RiskContext, signal: RiskSignal): void {
  const key = storeKey(ctx, signal.scope);
  const now = Date.now();
  const ttl = signal.ttlMs ?? SCOPE_DEFAULT_TTL[signal.scope];
  const expiresAt = ttl === Infinity ? Infinity : (ttl === 0 ? now + 60_000 : now + ttl);

  const stored: StoredSignal = { ...signal, addedAt: now, expiresAt };

  let arr = signalStore.get(key);
  if (!arr) {
    evictOldestKey();
    arr = [];
    signalStore.set(key, arr);
  }

  // 동일 요청 내 동일 type 중복 방지
  const isDuplicate = arr.some(
    s => s.type === signal.type && s.layer === signal.layer && now - s.addedAt < 1000,
  );
  if (isDuplicate) return;

  arr.push(stored);

  // 키당 최대 신호 수 제한
  if (arr.length > STORE_MAX_SIGNALS_PER_KEY) {
    arr.splice(0, arr.length - STORE_MAX_SIGNALS_PER_KEY);
  }
}

// ── 외부 API: Challenge 실패 기록 ──

export function recordChallengeFailure(ctx: RiskContext): void {
  const key = ctx.sessionId || ctx.ip;
  if (challengeFailures.size >= CHALLENGE_FAILURE_MAX && !challengeFailures.has(key)) {
    const fk = challengeFailures.keys().next().value;
    if (fk !== undefined) challengeFailures.delete(fk);
  }
  challengeFailures.set(key, (challengeFailures.get(key) || 0) + 1);
}

// ── 외부 API: Challenge 성공 → 점수 감쇠 ──

export function applyChallengeSuccess(ctx: RiskContext): void {
  applyRelief(ctx, 'session_risk', 20);
}

export function applyStepUpSuccess(ctx: RiskContext): void {
  applyRelief(ctx, 'session_risk', 30);
}

function applyRelief(ctx: RiskContext, scope: RiskScope, amount: number): void {
  const key = storeKey(ctx, scope);
  const arr = signalStore.get(key);
  if (!arr || arr.length === 0) return;

  let remaining = amount;
  // 가장 오래된 soft 신호부터 제거/감소
  for (let i = 0; i < arr.length && remaining > 0; i++) {
    if (arr[i].strength === 'soft' || arr[i].strength === 'medium') {
      if (arr[i].score <= remaining) {
        remaining -= arr[i].score;
        arr[i].score = 0;
      } else {
        arr[i].score -= remaining;
        remaining = 0;
      }
    }
  }
  // 점수 0인 신호 정리
  signalStore.set(key, arr.filter(s => s.score > 0));
}

// ── 핵심: 리스크 평가 ──

export function evaluate(ctx: RiskContext): RiskDecisionResult {
  const now = Date.now();
  const allSignals: StoredSignal[] = [];

  // 모든 관련 키에서 신호 수집
  const relevantKeys = [
    storeKey(ctx, 'session_risk'),
    storeKey(ctx, 'device_risk'),
    storeKey(ctx, 'ip_risk'),
    storeKey(ctx, 'account_risk'),
    storeKey(ctx, 'asset_integrity_risk'),
  ];

  for (const key of relevantKeys) {
    const arr = signalStore.get(key);
    if (!arr) continue;
    const pruned = pruneExpired(arr, now);
    signalStore.set(key, pruned);
    allSignals.push(...pruned);
  }

  // Family cap 적용
  const familyTotals = new Map<string, number>();
  const cappedSignals: StoredSignal[] = [];

  for (const sig of allSignals) {
    if (sig.family) {
      const current = familyTotals.get(sig.family) || 0;
      const cap = FAMILY_CAPS[sig.family] ?? Infinity;
      if (current >= cap) continue; // family cap 초과 → 무시
      const effective = Math.min(sig.score, cap - current);
      familyTotals.set(sig.family, current + effective);
      cappedSignals.push({ ...sig, score: effective });
    } else {
      cappedSignals.push(sig);
    }
  }

  // 스코프별 점수 합산
  const scopeScores: Record<RiskScope, number> = {
    request_risk: 0,
    session_risk: 0,
    device_risk: 0,
    ip_risk: 0,
    account_risk: 0,
    asset_integrity_risk: 0,
  };

  for (const sig of cappedSignals) {
    scopeScores[sig.scope] += sig.score;
  }

  const totalScore = Object.values(scopeScores).reduce((a, b) => a + b, 0);

  // Shadow 자격 판정
  const shadowQualification = evaluateShadowQualification(ctx, cappedSignals, totalScore);

  // 최종 판단
  const decision = determineDecision(ctx, totalScore, shadowQualification, cappedSignals);

  const decisionReason = buildDecisionReason(decision, totalScore, cappedSignals, shadowQualification);

  return {
    totalScore,
    scopeScores,
    activeSignals: cappedSignals,
    decision,
    decisionReason,
    shadowQualification,
  };
}

// ── Shadow 자격 판정 ──

function evaluateShadowQualification(
  ctx: RiskContext,
  signals: StoredSignal[],
  totalScore: number,
): ShadowQualification {
  const scoreThresholdMet = totalScore >= THRESHOLDS.SHADOW;

  const hasHardSignal = signals.some(s => s.strength === 'hard');

  // 중간 신호 2개 이상 + 서로 다른 카테고리
  const mediumSignals = signals.filter(s => s.strength === 'medium');
  const mediumCategories = new Set(mediumSignals.map(s => s.category));
  const hasCrossCategoryMedium = mediumSignals.length >= 2 && mediumCategories.size >= 2;

  // Challenge 실패 + 추가 이상
  const failKey = ctx.sessionId || ctx.ip;
  const failures = challengeFailures.get(failKey) || 0;
  const challengeFailedWithAccumulation = failures > 0 && totalScore >= THRESHOLDS.CHALLENGE;

  const qualified = scoreThresholdMet && (
    hasHardSignal || hasCrossCategoryMedium || challengeFailedWithAccumulation
  );

  return {
    scoreThresholdMet,
    hasHardSignal,
    hasCrossCategoryMedium,
    challengeFailedWithAccumulation,
    qualified,
  };
}

// ── 최종 판단 결정 ──

function determineDecision(
  ctx: RiskContext,
  totalScore: number,
  sq: ShadowQualification,
  signals: StoredSignal[],
): RiskDecision {
  // 운영 규칙 1: IP만으로 인증 사용자 Shadow 금지
  if (ctx.isAuthenticated) {
    const nonIpSignals = signals.filter(s => s.scope !== 'ip_risk');
    const nonIpScore = nonIpSignals.reduce((a, s) => a + s.score, 0);
    if (nonIpScore < THRESHOLDS.SHADOW && sq.qualified) {
      // IP만으로 90+ 달성 → Shadow 대신 Challenge
      if (totalScore >= THRESHOLDS.CHALLENGE) return 'challenge';
      if (totalScore >= THRESHOLDS.OBSERVE) return 'observe';
      return 'allow';
    }
  }

  // Shadow
  if (sq.qualified) return 'shadow';

  // Challenge: 50+ && 서로 다른 카테고리 2개 이상
  if (totalScore >= THRESHOLDS.CHALLENGE) {
    const categories = new Set(signals.map(s => s.category));
    if (categories.size >= 2) return 'challenge';
    // 카테고리 1개만이면 observe
    return 'observe';
  }

  // Observe
  if (totalScore >= THRESHOLDS.OBSERVE) return 'observe';

  return 'allow';
}

// ── 판단 근거 문자열 ──

function buildDecisionReason(
  decision: RiskDecision,
  totalScore: number,
  signals: StoredSignal[],
  sq: ShadowQualification,
): string {
  const parts: string[] = [`decision=${decision}`, `totalScore=${totalScore}`];

  if (decision === 'shadow') {
    if (sq.hasHardSignal) parts.push('hard_signal_present');
    if (sq.hasCrossCategoryMedium) parts.push('cross_category_medium');
    if (sq.challengeFailedWithAccumulation) parts.push('challenge_failed_accumulated');
  }

  const top3 = signals
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => `L${s.layer}:${s.type}(+${s.score})`);

  if (top3.length > 0) parts.push(`top_signals=[${top3.join(',')}]`);

  // 오탐/미탐 튜닝용: 임계값 ±10 근접 여부 기록
  // security_audits.reason 컬럼에서 'near_boundary' 검색으로 경계 케이스 필터링 가능
  const BOUNDARY_MARGIN = 10;
  if (decision === 'allow' && totalScore >= THRESHOLDS.OBSERVE - BOUNDARY_MARGIN) {
    parts.push(`near_boundary=observe(${THRESHOLDS.OBSERVE - totalScore}pts_away)`);
  } else if (decision === 'observe' && totalScore >= THRESHOLDS.CHALLENGE - BOUNDARY_MARGIN) {
    parts.push(`near_boundary=challenge(${THRESHOLDS.CHALLENGE - totalScore}pts_away)`);
  } else if (decision === 'challenge' && totalScore >= THRESHOLDS.SHADOW - BOUNDARY_MARGIN) {
    parts.push(`near_boundary=shadow(${THRESHOLDS.SHADOW - totalScore}pts_away)`);
  }

  return parts.join('; ');
}

// ── 편의 함수: Layer별 신호 추가 ──

export function reportLayer(
  ctx: RiskContext,
  layer: number,
  type: string,
  score: number,
  scope: RiskScope,
  category: RiskCategory,
  strength: SignalStrength,
  opts?: { family?: string; detail?: string; ttlMs?: number },
): void {
  addSignal(ctx, {
    layer,
    type,
    score,
    scope,
    category,
    strength,
    family: opts?.family,
    detail: opts?.detail,
    ttlMs: opts?.ttlMs,
  });
}

// ── 하위 호환 래퍼 (기존 evaluateRisk 호출자 지원) ──

export function evaluateLegacy(params: {
  ip: string;
  userAgent: string;
  isNewDevice?: boolean;
  userId?: string;
  pathname?: string;
}): LegacyRiskResult {
  const ctx: RiskContext = {
    ip: params.ip,
    userAgent: params.userAgent,
    userId: params.userId,
    pathname: params.pathname || '/',
    method: 'GET',
    isAuthenticated: !!params.userId,
  };

  const result = evaluate(ctx);

  // Legacy 레벨 매핑
  let level: LegacyRiskLevel;
  let action: LegacyRiskAction;

  if (result.decision === 'shadow') {
    level = 'critical';
    action = 'criticalBlock';
  } else if (result.decision === 'challenge') {
    level = 'high';
    action = 'tempBlock';
  } else if (result.decision === 'observe') {
    level = 'medium';
    action = 'stepUp';
  } else {
    level = 'low';
    action = 'allow';
  }

  return {
    score: result.totalScore,
    level,
    signals: result.activeSignals.map(s => ({
      type: s.type,
      score: s.score,
      detail: s.detail,
    })),
    action,
  };
}

// ── 주기적 정리 (5분마다) ──

function cleanupExpiredSignals(): void {
  const now = Date.now();
  for (const [key, signals] of signalStore) {
    const pruned = pruneExpired(signals, now);
    if (pruned.length === 0) {
      signalStore.delete(key);
    } else {
      signalStore.set(key, pruned);
    }
  }

  // Challenge 실패 기록도 24시간 후 정리
  const challengeCutoff = now - 24 * 60 * 60 * 1000;
  for (const [key] of challengeFailures) {
    // challengeFailures는 타임스탬프 없으므로 주기적으로 전체 정리
    if (challengeFailures.size > CHALLENGE_FAILURE_MAX * 0.8) {
      const fk = challengeFailures.keys().next().value;
      if (fk !== undefined) challengeFailures.delete(fk);
    }
  }
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__riskEngineCleanup === 'undefined') {
  (globalThis as any).__riskEngineCleanup = true;
  setInterval(cleanupExpiredSignals, 5 * 60 * 1000);
}

// ── 테스트/디버그용 내부 상태 리셋 ──

export function __resetForTesting(): void {
  signalStore.clear();
  challengeFailures.clear();
}
