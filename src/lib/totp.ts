/**
 * TOTP (RFC 6238) — Time-based One-Time Password
 * - 외부 라이브러리 없이 Node.js crypto만 사용
 * - Base32 인코딩/디코딩 (RFC 4648)
 * - HMAC-SHA1 기반 HOTP (RFC 4226)
 * - ±1 time-step 윈도우 허용 (시계 오차 대응)
 */

import crypto from 'crypto';

// ── Base32 (RFC 4648) ──
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHA[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHA[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

export function base32Decode(input: string): Buffer {
  const str = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of str) {
    const idx = B32_ALPHA.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── HOTP (RFC 4226) ──
function hotp(secret: Buffer, counter: bigint, digits = 6): string {
  const cBuf = Buffer.alloc(8);
  cBuf.writeBigUInt64BE(counter);
  const hmac = crypto.createHmac('sha1', secret).update(cBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

// ── TOTP (RFC 6238) ──
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30; // seconds
export const TOTP_WINDOW = 1;  // ±1 스텝 허용

/** 새 TOTP 시크릿 생성 (160-bit random → Base32) */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** 특정 시각의 TOTP 코드 계산 */
export function computeTotp(secret: string, timestamp = Date.now()): string {
  const key = base32Decode(secret);
  const counter = BigInt(Math.floor(timestamp / 1000 / TOTP_PERIOD));
  return hotp(key, counter, TOTP_DIGITS);
}

/** TOTP 코드 검증 (±TOTP_WINDOW 스텝 허용) */
export function verifyTotp(
  secret: string,
  code: string,
  timestamp = Date.now(),
  window = TOTP_WINDOW,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const now = BigInt(Math.floor(timestamp / 1000 / TOTP_PERIOD));
  for (let d = -window; d <= window; d++) {
    const expected = hotp(key, now + BigInt(d), TOTP_DIGITS);
    try {
      if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return true;
    } catch {
      // 길이 다름 — false 계속
    }
  }
  return false;
}

/** Google Authenticator / Authy 호환 URI */
export function generateTotpUri(params: {
  secret: string;
  label: string;
  issuer?: string;
}): string {
  const { secret, label, issuer = 'PickMyAI' } = params;
  const cleanSecret = secret.replace(/=+$/, '');
  return (
    `otpauth://totp/${encodeURIComponent(label)}` +
    `?secret=${cleanSecret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1` +
    `&digits=${TOTP_DIGITS}` +
    `&period=${TOTP_PERIOD}`
  );
}
