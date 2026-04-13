/**
 * PickMyAI Wasm Canary — Layer 19
 *
 * 서버 관측형 리버스 엔지니어링 카나리.
 * .wasm 디코이는 함정일 뿐, 신뢰 경계가 아님.
 *
 * 서버가 관측 가능한 디코이 엔드포인트 접근 / signed canary artifact 제출이
 * 있을 때만 강한 신호로 사용.
 *
 * 점수: exploit_intent +100
 */

import crypto from 'crypto';

// 카나리 artifact 목록 (정상 클라이언트는 절대 제출하지 않는 값)
const CANARY_ARTIFACTS = new Set([
  'grantAdminAccess',
  'bypassPayment',
  'unlimitedCredits',
  'debugMode',
  'adminShell',
  'revealSecrets',
  'forceAuth',
  'disableSecurity',
]);

// 서버 측 카나리 ID 발급 이력
const canaryIssued = new Map<string, { ip: string; issuedAt: number }>();
const CANARY_MAX = 10_000;

/**
 * 카나리 artifact인지 확인
 */
export function isCanaryArtifact(artifact: string): boolean {
  return CANARY_ARTIFACTS.has(artifact);
}

/**
 * 카나리 ID 발급 (Wasm 빌드 시 임베딩용)
 */
export function issueCanaryId(ip: string): string {
  const id = `canary_${crypto.randomBytes(16).toString('hex')}`;

  if (canaryIssued.size >= CANARY_MAX) {
    const fk = canaryIssued.keys().next().value;
    if (fk !== undefined) canaryIssued.delete(fk);
  }
  canaryIssued.set(id, { ip, issuedAt: Date.now() });

  return id;
}

/**
 * 카나리 엔드포인트 접근 확인
 *
 * 정상 클라이언트는 이 엔드포인트를 호출하지 않음.
 * 호출이 발생하면 리버스 엔지니어링 시도로 간주.
 */
export function verifyCanaryAccess(params: {
  canaryId?: string;
  artifact?: string;
  ip: string;
}): { isReverseEngineering: boolean; detail: string } {
  const { canaryId, artifact, ip } = params;

  // artifact 직접 제출
  if (artifact && isCanaryArtifact(artifact)) {
    return {
      isReverseEngineering: true,
      detail: `Canary artifact submitted: ${artifact}`,
    };
  }

  // 발급된 canary ID로 접근
  if (canaryId) {
    const issued = canaryIssued.get(canaryId);
    if (issued) {
      return {
        isReverseEngineering: true,
        detail: `Canary ID used: ${canaryId} (issued to ${issued.ip} at ${new Date(issued.issuedAt).toISOString()})`,
      };
    }
    // 알 수 없는 canary ID = 조작 시도
    return {
      isReverseEngineering: true,
      detail: `Unknown canary ID: ${canaryId}`,
    };
  }

  return { isReverseEngineering: false, detail: '' };
}

// 주기적 정리 (24시간 이상 된 canary 제거)
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__canaryCleanup === 'undefined') {
  (globalThis as any).__canaryCleanup = true;
  setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, record] of canaryIssued) {
      if (record.issuedAt < cutoff) canaryIssued.delete(id);
    }
  }, 60 * 60 * 1000);
}
