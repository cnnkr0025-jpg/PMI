/**
 * PickMyAI Challenge Orchestrator — Layer 16
 *
 * Step-up Challenge 오케스트레이션.
 * 50+ 리스크 또는 고가치 자산 작업에서 발동.
 *
 * 챌린지 유형:
 *   - PoW (Proof of Work) 해시 퍼즐
 *   - Captcha (외부 서비스 연동)
 *   - WebAuthn step-up (향후)
 *
 * 점수:
 *   - 실패: +30
 *   - 성공: session_risk -20
 */

import crypto from 'crypto';

export type ChallengeType = 'pow' | 'captcha';

export interface ChallengeIssued {
  id: string;
  type: ChallengeType;
  /** PoW: 해시 퍼즐 프리픽스 */
  puzzle?: string;
  /** PoW: 필요한 선행 0 비트 수 */
  difficulty?: number;
  /** 만료 시각 */
  expiresAt: number;
}

interface StoredChallenge {
  id: string;
  type: ChallengeType;
  userId?: string;
  sessionId?: string;
  ip: string;
  puzzle?: string;
  difficulty?: number;
  issuedAt: number;
  expiresAt: number;
  solved: boolean;
}

const challengeStore = new Map<string, StoredChallenge>();
const CHALLENGE_STORE_MAX = 50_000;
const CHALLENGE_TTL_MS = 60_000; // 1분

/**
 * PoW 챌린지 발급
 */
export function issueChallenge(params: {
  ip: string;
  userId?: string;
  sessionId?: string;
  type?: ChallengeType;
}): ChallengeIssued {
  const { ip, userId, sessionId, type = 'pow' } = params;
  const id = crypto.randomUUID();
  const now = Date.now();

  if (type === 'pow') {
    const puzzle = crypto.randomBytes(16).toString('hex');
    const difficulty = 4; // 선행 0 니블 수 (난이도 조절 가능)

    const stored: StoredChallenge = {
      id,
      type,
      userId,
      sessionId,
      ip,
      puzzle,
      difficulty,
      issuedAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
      solved: false,
    };

    if (challengeStore.size >= CHALLENGE_STORE_MAX) {
      const fk = challengeStore.keys().next().value;
      if (fk !== undefined) challengeStore.delete(fk);
    }
    challengeStore.set(id, stored);

    return {
      id,
      type: 'pow',
      puzzle,
      difficulty,
      expiresAt: stored.expiresAt,
    };
  }

  // Captcha fallback
  const stored: StoredChallenge = {
    id,
    type: 'captcha',
    userId,
    sessionId,
    ip,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS * 3, // captcha에 더 긴 시간
    solved: false,
  };

  if (challengeStore.size >= CHALLENGE_STORE_MAX) {
    const fk = challengeStore.keys().next().value;
    if (fk !== undefined) challengeStore.delete(fk);
  }
  challengeStore.set(id, stored);

  return { id, type: 'captcha', expiresAt: stored.expiresAt };
}

export type ChallengeVerifyResult =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'expired' | 'already_solved' | 'invalid_solution' };

/**
 * PoW 챌린지 검증
 *
 * 클라이언트가 nonce를 찾아서 sha256(puzzle + nonce)의 앞 difficulty 니블이 모두 0인지 확인
 */
export function verifyChallenge(params: {
  challengeId: string;
  solution: string; // PoW: nonce, Captcha: captcha token
  ip: string;
}): ChallengeVerifyResult {
  const { challengeId, solution, ip } = params;

  const challenge = challengeStore.get(challengeId);
  if (!challenge) {
    return { valid: false, reason: 'not_found' };
  }

  if (Date.now() > challenge.expiresAt) {
    challengeStore.delete(challengeId);
    return { valid: false, reason: 'expired' };
  }

  if (challenge.solved) {
    return { valid: false, reason: 'already_solved' };
  }

  if (challenge.type === 'pow') {
    if (!challenge.puzzle || !challenge.difficulty) {
      return { valid: false, reason: 'invalid_solution' };
    }

    const hash = crypto
      .createHash('sha256')
      .update(challenge.puzzle + solution)
      .digest('hex');

    const prefix = '0'.repeat(challenge.difficulty);
    if (!hash.startsWith(prefix)) {
      return { valid: false, reason: 'invalid_solution' };
    }

    challenge.solved = true;
    return { valid: true };
  }

  if (challenge.type === 'captcha') {
    // Captcha 검증은 외부 서비스 호출 필요
    // 여기서는 토큰 존재 여부만 확인 (실제 구현 시 reCAPTCHA/hCaptcha API 호출)
    if (!solution || solution.length < 10) {
      return { valid: false, reason: 'invalid_solution' };
    }
    challenge.solved = true;
    return { valid: true };
  }

  return { valid: false, reason: 'invalid_solution' };
}

/**
 * 주기적 만료 챌린지 정리
 */
function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [id, c] of challengeStore) {
    if (c.expiresAt < now) challengeStore.delete(id);
  }
}

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__challengeCleanup === 'undefined') {
  (globalThis as any).__challengeCleanup = true;
  setInterval(cleanupExpiredChallenges, 30_000);
}
