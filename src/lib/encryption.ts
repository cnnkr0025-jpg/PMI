import crypto from 'crypto';

/**
 * AES-256-GCM 인증 암호화 모듈
 * - 12바이트 랜덤 IV + 16바이트 Auth Tag
 * - 키 버전 접두사로 키 롤링 지원
 * - 환경변수 ENCRYPTION_KEY (64자 hex = 256bit)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION_PREFIX = 'v1:';

// 키 캐시 (파싱 비용 절감)
let _cachedKey: Buffer | null = null;
let _cachedKeySource: string | null = null;

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 64) {
    throw new Error('ENCRYPTION_KEY must be at least 64 hex characters (256-bit).');
  }
  if (raw === _cachedKeySource && _cachedKey) return _cachedKey;
  _cachedKey = Buffer.from(raw.slice(0, 64), 'hex');
  _cachedKeySource = raw;
  return _cachedKey;
}

/**
 * 이전 키 가져오기 (키 롤링 시 복호화용)
 */
function getPreviousEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY_PREV;
  if (!raw || raw.length < 64) return null;
  return Buffer.from(raw.slice(0, 64), 'hex');
}

/**
 * AES-256-GCM 암호화
 * 반환 형식: "v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${KEY_VERSION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * AES-256-GCM 복호화
 * 키 롤링 지원: 현재 키 실패 시 이전 키로 재시도
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';

  const result = tryDecryptWithKey(ciphertext, getEncryptionKey());
  if (result !== null) return result;

  // 현재 키 실패 → 이전 키로 재시도 (키 롤링)
  const prevKey = getPreviousEncryptionKey();
  if (prevKey) {
    const prevResult = tryDecryptWithKey(ciphertext, prevKey);
    if (prevResult !== null) return prevResult;
  }

  throw new Error('Decryption failed: invalid key or corrupted data.');
}

function tryDecryptWithKey(ciphertext: string, key: Buffer): string | null {
  try {
    let payload = ciphertext;
    // 버전 접두사 제거
    if (payload.startsWith(KEY_VERSION_PREFIX)) {
      payload = payload.slice(KEY_VERSION_PREFIX.length);
    }

    const parts = payload.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) return null;

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * 데이터가 암호화된 형식인지 확인
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(KEY_VERSION_PREFIX) && value.split(':').length === 4;
}

/**
 * 암호화된 데이터를 새 키로 재암호화 (키 롤링 마이그레이션)
 */
export function reEncrypt(ciphertext: string): string {
  const plaintext = decrypt(ciphertext);
  return encrypt(plaintext);
}

/**
 * 민감 데이터 해싱 (비가역, 비교 목적)
 */
export function hashSensitive(data: string): string {
  const salt = process.env.ENCRYPTION_KEY?.slice(0, 16) || 'default-salt-val';
  return crypto.createHmac('sha256', salt).update(data).digest('hex');
}
