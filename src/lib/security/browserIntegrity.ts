/**
 * PickMyAI Browser/Device Integrity — Layer 17
 *
 * WebGL / Audio / Canvas / UA continuity 검증.
 * 브라우저 업데이트·GPU 드라이버 변경을 고려하여 drift 단독은 약한 신호.
 *
 * 점수:
 *   - drift 단독: +10
 *   - drift + session anomaly 결합: +40 상향
 */

import crypto from 'crypto';

export interface FingerprintData {
  webglHash?: string;
  audioHash?: string;
  canvasHash?: string;
  screenResolution?: string;
  timezone?: string;
  languages?: string[];
  platform?: string;
  hardwareConcurrency?: number;
}

interface StoredFingerprint {
  hash: string;
  raw: FingerprintData;
  lastSeen: number;
  userId: string;
}

// 사용자별 디바이스 핑거프린트 이력
const fingerprintStore = new Map<string, StoredFingerprint[]>();
const FP_STORE_MAX = 50_000;
const FP_MAX_PER_USER = 5; // 사용자당 최대 5개 디바이스 기록

/**
 * 핑거프린트 해시 계산
 */
export function computeFingerprintHash(data: FingerprintData): string {
  const normalized = JSON.stringify({
    webgl: data.webglHash || '',
    audio: data.audioHash || '',
    canvas: data.canvasHash || '',
    screen: data.screenResolution || '',
    tz: data.timezone || '',
    lang: (data.languages || []).sort().join(','),
    platform: data.platform || '',
    hw: data.hardwareConcurrency || 0,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export interface IntegrityCheckResult {
  /** 알려진 디바이스인지 */
  knownDevice: boolean;
  /** 드리프트 감지 (부분 변경) */
  driftDetected: boolean;
  /** 디바이스 해시 */
  deviceHash: string;
  /** drift 상세 (어떤 필드가 변경됐는지) */
  driftFields: string[];
}

/**
 * 디바이스 핑거프린트 검증
 */
export function checkBrowserIntegrity(userId: string, data: FingerprintData): IntegrityCheckResult {
  const currentHash = computeFingerprintHash(data);
  const stored = fingerprintStore.get(userId);

  if (!stored || stored.length === 0) {
    // 첫 접근 — 기록
    registerFingerprint(userId, currentHash, data);
    return { knownDevice: false, driftDetected: false, deviceHash: currentHash, driftFields: [] };
  }

  // 정확히 일치하는 디바이스 검색
  const exactMatch = stored.find(s => s.hash === currentHash);
  if (exactMatch) {
    exactMatch.lastSeen = Date.now();
    return { knownDevice: true, driftDetected: false, deviceHash: currentHash, driftFields: [] };
  }

  // 부분 일치 (drift) 검사
  const driftFields: string[] = [];
  const closest = stored[stored.length - 1]; // 최근 핑거프린트와 비교

  if (closest.raw.webglHash && data.webglHash && closest.raw.webglHash !== data.webglHash) {
    driftFields.push('webgl');
  }
  if (closest.raw.audioHash && data.audioHash && closest.raw.audioHash !== data.audioHash) {
    driftFields.push('audio');
  }
  if (closest.raw.canvasHash && data.canvasHash && closest.raw.canvasHash !== data.canvasHash) {
    driftFields.push('canvas');
  }
  if (closest.raw.platform && data.platform && closest.raw.platform !== data.platform) {
    driftFields.push('platform');
  }
  if (closest.raw.timezone && data.timezone && closest.raw.timezone !== data.timezone) {
    driftFields.push('timezone');
  }

  const driftDetected = driftFields.length > 0;

  // 새 디바이스 등록
  registerFingerprint(userId, currentHash, data);

  return { knownDevice: false, driftDetected, deviceHash: currentHash, driftFields };
}

function registerFingerprint(userId: string, hash: string, raw: FingerprintData): void {
  let arr = fingerprintStore.get(userId);
  if (!arr) {
    if (fingerprintStore.size >= FP_STORE_MAX) {
      const fk = fingerprintStore.keys().next().value;
      if (fk !== undefined) fingerprintStore.delete(fk);
    }
    arr = [];
    fingerprintStore.set(userId, arr);
  }

  arr.push({ hash, raw, lastSeen: Date.now(), userId });
  if (arr.length > FP_MAX_PER_USER) {
    arr.shift(); // 가장 오래된 제거
  }
}
