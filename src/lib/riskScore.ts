/**
 * 이상행위 점수 기반 탐지 엔진 (Risk Score) — Legacy Wrapper
 *
 * 이 파일은 하위 호환 래퍼입니다.
 * 실제 로직은 src/lib/security/riskEngine.ts의 다차원 리스크 엔진이 처리합니다.
 *
 * 기존 호출자 (admin/login/route.ts 등)를 위해
 * evaluateRisk, recordHoneypotHit, recordTokenReuse, recordAdminBurst,
 * riskActionToHttpStatus API를 모두 유지합니다.
 */

import { evaluateLegacy, reportLayer } from './security/riskEngine';
import type { RiskContext } from './security/riskTypes';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignal {
  type: string;
  score: number;
  detail?: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
  action: 'allow' | 'stepUp' | 'tempBlock' | 'criticalBlock';
}

/** 허니팟 접근 기록 → 새 엔진에 Layer 3 신호 보고 */
export function recordHoneypotHit(ip: string): void {
  const ctx: RiskContext = {
    ip,
    userAgent: '',
    pathname: '/honeypot',
    method: 'GET',
    isAuthenticated: false,
  };
  reportLayer(ctx, 3, 'HONEYPOT_HIT', 40, 'ip_risk', 'exploit_intent', 'medium', {
    detail: `Honeypot access from ${ip}`,
  });
}

/** 토큰 재사용 시도 기록 → 새 엔진에 Layer 11 신호 보고 */
export function recordTokenReuse(ip: string): void {
  const ctx: RiskContext = {
    ip,
    userAgent: '',
    pathname: '/',
    method: 'POST',
    isAuthenticated: false,
  };
  reportLayer(ctx, 11, 'TOKEN_REPLAY', 80, 'session_risk', 'session_integrity', 'hard', {
    detail: `Token replay attempt from ${ip}`,
  });
}

/** 관리자 경로 burst 기록 → 새 엔진에 Layer 9 신호 보고 */
export function recordAdminBurst(ip: string): void {
  const ctx: RiskContext = {
    ip,
    userAgent: '',
    pathname: '/api/admin',
    method: 'POST',
    isAuthenticated: false,
  };
  reportLayer(ctx, 9, 'ADMIN_BURST', 30, 'ip_risk', 'exploit_intent', 'medium', {
    detail: `Admin burst from ${ip}`,
    family: 'automation_burst',
  });
}

/** 하위 호환 평가 함수 — 새 엔진으로 위임 */
export function evaluateRisk(params: {
  ip: string;
  userAgent: string;
  isNewDevice?: boolean;
  userId?: string;
  pathname?: string;
}): RiskResult {
  return evaluateLegacy(params);
}

/** 하위 호환 HTTP 상태 코드 매핑 */
export function riskActionToHttpStatus(action: RiskResult['action']): number | null {
  if (action === 'criticalBlock' || action === 'tempBlock') return 429;
  return null;
}
