/**
 * PickMyAI Freeze Gate — Layer 21
 *
 * 뉴클리어 락 및 다중 서명 복구.
 *
 * 발동 조건 (동시 충족):
 *   - 1분 내 총 PMC 변동 10,000,000 이상
 *   - 승인된 배치/정산/충전 이벤트로 설명 불가
 *   - Ledger 검증 실패 또는 비인가 쓰기 흔적 존재
 *
 * 즉시 조치:
 *   - 애플리케이션 write gate 전역 차단
 *   - 운영자 사고 채널 경보
 *
 * 정상화:
 *   - 다중 서명 승인 후에만 가능
 */

import { sendSecurityAlert } from '../alerting';
import { securityAudit, generateCorrelationId } from '../auditLog';

// ── 전역 Freeze 상태 ──
let globalFreezeActive = false;
let freezeReason = '';
let freezeTriggeredAt = 0;

// 다중 서명 복구 구조
interface FreezeSignature {
  signerId: string;
  signedAt: number;
}

const REQUIRED_SIGNERS = 2;
let recoverSignatures: FreezeSignature[] = [];

/**
 * Freeze 상태 확인 (모든 write 작업 전 호출)
 */
export function isFrozen(): boolean {
  return globalFreezeActive;
}

/**
 * Freeze 상태 상세 조회
 */
export function getFreezeStatus(): {
  active: boolean;
  reason: string;
  triggeredAt: number;
  signatures: FreezeSignature[];
  requiredSigners: number;
} {
  return {
    active: globalFreezeActive,
    reason: freezeReason,
    triggeredAt: freezeTriggeredAt,
    signatures: [...recoverSignatures],
    requiredSigners: REQUIRED_SIGNERS,
  };
}

/**
 * Nuclear Freeze 발동
 *
 * 이 함수가 호출되면:
 *   1. 전역 write gate 차단
 *   2. 운영자 긴급 알림
 *   3. 감사 로그 기록
 */
export function triggerFreeze(params: {
  reason: string;
  pmcDelta1min?: number;
  triggeredBy?: string;
}): void {
  const { reason, pmcDelta1min, triggeredBy } = params;

  if (globalFreezeActive) return; // 이미 Freeze 중

  globalFreezeActive = true;
  freezeReason = reason;
  freezeTriggeredAt = Date.now();
  recoverSignatures = [];

  // 긴급 알림
  sendSecurityAlert({
    title: 'NUCLEAR FREEZE ACTIVATED',
    message: `전역 Write Gate 차단됨. 사유: ${reason}`,
    severity: 'critical',
    fields: {
      Reason: reason,
      'PMC Delta (1min)': pmcDelta1min ? String(pmcDelta1min) : 'N/A',
      'Triggered By': triggeredBy || 'system',
      'Required Signers': String(REQUIRED_SIGNERS),
    },
  });

  // 감사 로그
  const correlationId = generateCorrelationId();
  securityAudit({
    correlation_id: correlationId,
    decision: 'vault',
    reason: `NUCLEAR_FREEZE: ${reason}`,
    score_total: 0,
    score_breakdown: {},
    scope_snapshot: {},
    triggered_layers: [21],
    freeze_reason: reason,
  });

  console.error('[NUCLEAR FREEZE]', reason, new Date().toISOString());
}

/**
 * Freeze 해제 서명 제출
 *
 * 필요한 수의 서명이 모이면 자동으로 Freeze 해제.
 */
export function submitRecoverySignature(signerId: string): {
  accepted: boolean;
  totalSignatures: number;
  released: boolean;
  error?: string;
} {
  if (!globalFreezeActive) {
    return { accepted: false, totalSignatures: 0, released: false, error: 'No active freeze' };
  }

  // 중복 서명 방지
  if (recoverSignatures.some(s => s.signerId === signerId)) {
    return {
      accepted: false,
      totalSignatures: recoverSignatures.length,
      released: false,
      error: 'Already signed',
    };
  }

  recoverSignatures.push({ signerId, signedAt: Date.now() });

  if (recoverSignatures.length >= REQUIRED_SIGNERS) {
    // 충분한 서명 → Freeze 해제
    releaseFreeze(`Multi-sig recovery: ${recoverSignatures.map(s => s.signerId).join(', ')}`);
    return { accepted: true, totalSignatures: recoverSignatures.length, released: true };
  }

  return { accepted: true, totalSignatures: recoverSignatures.length, released: false };
}

/**
 * Freeze 해제 (내부 함수)
 */
function releaseFreeze(reason: string): void {
  globalFreezeActive = false;

  sendSecurityAlert({
    title: 'NUCLEAR FREEZE RELEASED',
    message: `전역 Write Gate 해제됨. 사유: ${reason}`,
    severity: 'critical',
    fields: {
      Reason: reason,
      'Freeze Duration': `${Math.round((Date.now() - freezeTriggeredAt) / 1000)}초`,
      Signers: recoverSignatures.map(s => s.signerId).join(', '),
    },
  });

  securityAudit({
    correlation_id: generateCorrelationId(),
    decision: 'allow',
    reason: `FREEZE_RELEASED: ${reason}`,
    score_total: 0,
    score_breakdown: {},
    scope_snapshot: {},
    triggered_layers: [21],
    operator_action: reason,
  });

  freezeReason = '';
  freezeTriggeredAt = 0;
  recoverSignatures = [];
}

/**
 * Write Gate 확인 미들웨어 헬퍼
 *
 * 모든 자산 변경 API route 시작점에서 호출.
 * Freeze 상태면 즉시 503 반환.
 */
export function checkWriteGate(): { allowed: boolean; error?: string } {
  if (globalFreezeActive) {
    return { allowed: false, error: 'System is in emergency freeze mode. All write operations suspended.' };
  }
  return { allowed: true };
}
