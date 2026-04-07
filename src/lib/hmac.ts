import crypto from 'crypto';

/**
 * HMAC 요청 서명 / 검증
 * - API 요청 무결성 보장
 * - Replay Attack 방지 (타임스탬프 검증)
 * - 환경변수: HMAC_SECRET (최소 32자)
 */

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5분

function getHmacSecret(): string {
  const secret = process.env.HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('HMAC_SECRET 또는 JWT_SECRET이 32자 이상이어야 합니다.');
  }
  return secret;
}

/**
 * 요청 서명 생성
 * signature = HMAC-SHA256(secret, method + path + timestamp + bodyHash)
 */
export function signRequest(params: {
  method: string;
  path: string;
  body?: string;
  timestamp?: number;
}): { signature: string; timestamp: number } {
  const ts = params.timestamp || Date.now();
  const bodyHash = params.body
    ? crypto.createHash('sha256').update(params.body).digest('hex')
    : '';

  const payload = [
    params.method.toUpperCase(),
    params.path,
    ts.toString(),
    bodyHash,
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', getHmacSecret())
    .update(payload)
    .digest('hex');

  return { signature, timestamp: ts };
}

/**
 * 요청 서명 검증
 * - 타임스탬프 검증 (Replay 방지)
 * - HMAC 일치 확인
 */
export function verifyRequestSignature(params: {
  method: string;
  path: string;
  body?: string;
  signature: string;
  timestamp: number;
}): { valid: boolean; error?: string } {
  // 타임스탬프 검증
  const now = Date.now();
  const diff = Math.abs(now - params.timestamp);
  if (diff > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, error: '요청이 만료되었습니다 (timestamp).' };
  }

  // 서명 재생성 후 비교
  const { signature: expected } = signRequest({
    method: params.method,
    path: params.path,
    body: params.body,
    timestamp: params.timestamp,
  });

  // 상수 시간 비교
  const a = Buffer.from(params.signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) {
    return { valid: false, error: '서명이 유효하지 않습니다.' };
  }

  const match = crypto.timingSafeEqual(a, b);
  return match
    ? { valid: true }
    : { valid: false, error: '서명이 유효하지 않습니다.' };
}
