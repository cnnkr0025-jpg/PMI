/**
 * 디바이스 핑거프린팅
 * - 클라이언트: canvas, WebGL, screen, timezone, 언어 등 조합
 * - 서버: UA + IP + Accept 헤더 조합 해싱
 * - localStorage에 deviceId 저장 (세션 간 추적)
 */

const DEVICE_ID_KEY = 'pick-my-ai-device-id';

/**
 * 클라이언트 사이드 디바이스 핑거프린트 생성
 * 브라우저 환경에서만 동작
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server';

  // 기존 deviceId가 있으면 반환
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length === 64) return stored;
  } catch {}

  const components: string[] = [];

  // Screen
  try {
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  } catch {}

  // Timezone
  try {
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {}

  // Language
  try {
    components.push(navigator.language);
    components.push(String(navigator.languages?.length || 0));
  } catch {}

  // Platform
  try {
    components.push(navigator.platform || '');
  } catch {}

  // Hardware concurrency
  try {
    components.push(String(navigator.hardwareConcurrency || 0));
  } catch {}

  // Device memory (Chrome only)
  try {
    components.push(String((navigator as any).deviceMemory || 0));
  } catch {}

  // Touch support
  try {
    components.push(String(navigator.maxTouchPoints || 0));
  } catch {}

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('PickMyAI:fp', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('PickMyAI:fp', 4, 17);
      components.push(canvas.toDataURL().slice(-50));
    }
  } catch {}

  // WebGL renderer
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        components.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      }
    }
  } catch {}

  // 해싱 (Web Crypto API)
  const raw = components.join('|');
  const hash = await hashString(raw);

  // 저장
  try {
    localStorage.setItem(DEVICE_ID_KEY, hash);
  } catch {}

  return hash;
}

/**
 * 서버 사이드 요청 핑거프린트
 * UA + Accept + Accept-Encoding + Accept-Language 조합
 */
export function getServerRequestFingerprint(headers: {
  get(name: string): string | null;
}): string {
  const parts = [
    headers.get('user-agent') || '',
    headers.get('accept') || '',
    headers.get('accept-encoding') || '',
    headers.get('accept-language') || '',
    headers.get('sec-ch-ua') || '',
    headers.get('sec-ch-ua-platform') || '',
  ].join('|');

  // Node.js crypto 사용 (서버 사이드)
  if (typeof globalThis !== 'undefined' && typeof require === 'function') {
    try {
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(parts).digest('hex');
    } catch {}
  }

  // Fallback: 간단한 해시
  return simpleHash(parts);
}

/**
 * Web Crypto API SHA-256
 */
async function hashString(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return simpleHash(input);
}

/**
 * 간단한 폴백 해시 (crypto.subtle 미지원 환경)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * 저장된 deviceId 가져오기 (동기)
 */
export function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}
