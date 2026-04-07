/**
 * 이상행위 점수 기반 탐지 엔진 (Risk Score)
 *
 * 신호별 가중치:
 *   +15  새 기기 감지
 *   +20  짧은 시간 내 UA 변화
 *   +25  짧은 시간 내 지역(IP 서브넷) 변화
 *   +40  토큰 재사용 시도
 *   +30  Burst 요청 + 관리자 경로 접근
 *   +35  허니팟 경로 접근 이력
 *   +20  비정상 시간대 접근 (UTC 01–05시)
 *   +15  알 수 없는 IP (unknown)
 *
 * 임계값:
 *   30+  추가 인증 요구 (stepUpRequired)
 *   60+  임시 차단 (tempBlock)
 *   80+  관리자 알림 + 세션 폐기 (criticalBlock)
 */

import { sendSecurityAlert } from './alerting';
import { audit } from './auditLog';

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

// ── 인메모리 상태 저장소 ──
interface IpHistory {
  ua: string;
  subnet: string;    // IP 앞 두 옥텟 (/16 서브넷)
  ts: number;
}

interface HoneypotRecord {
  count: number;
  lastTs: number;
}

// IP별 최근 방문 이력 (UA/서브넷 추적용)
const ipHistory = new Map<string, IpHistory>();
const IP_HISTORY_MAX = 50_000;

// 허니팟 히트 이력 (IP별)
const honeypotHistory = new Map<string, HoneypotRecord>();
const HONEYPOT_HISTORY_MAX = 20_000;

// 토큰 재사용 의심 IP
const tokenReuseIps = new Set<string>();
const TOKEN_REUSE_MAX = 10_000;

// 관리자 경로 burst IP
const adminBurstIps = new Set<string>();
const ADMIN_BURST_MAX = 10_000;

// ── 유틸리티 ──
function toSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return ip; // IPv6 등 폴백
}

function isNightHour(): boolean {
  const h = new Date().getUTCHours();
  return h >= 1 && h <= 5; // UTC 01–05시 (KST 10시–14시 아님, 새벽 기준)
}

function safeMapSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (!map.has(key) && map.size >= max) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

// ── 이벤트 기록 API (외부에서 호출) ──

/** 허니팟 접근 기록 */
export function recordHoneypotHit(ip: string): void {
  const rec = honeypotHistory.get(ip);
  if (rec) {
    rec.count++;
    rec.lastTs = Date.now();
  } else {
    safeMapSet(honeypotHistory, ip, { count: 1, lastTs: Date.now() }, HONEYPOT_HISTORY_MAX);
  }
}

/** 토큰 재사용 시도 기록 */
export function recordTokenReuse(ip: string): void {
  if (tokenReuseIps.size >= TOKEN_REUSE_MAX) {
    const first = tokenReuseIps.values().next().value;
    if (first !== undefined) tokenReuseIps.delete(first);
  }
  tokenReuseIps.add(ip);
}

/** 관리자 경로 burst 기록 */
export function recordAdminBurst(ip: string): void {
  if (adminBurstIps.size >= ADMIN_BURST_MAX) {
    const first = adminBurstIps.values().next().value;
    if (first !== undefined) adminBurstIps.delete(first);
  }
  adminBurstIps.add(ip);
}

// ── 핵심 평가 함수 ──
export function evaluateRisk(params: {
  ip: string;
  userAgent: string;
  isNewDevice?: boolean;
  userId?: string;
  pathname?: string;
}): RiskResult {
  const { ip, userAgent, isNewDevice = false, userId, pathname } = params;
  const signals: RiskSignal[] = [];
  let score = 0;

  const add = (type: string, pts: number, detail?: string) => {
    signals.push({ type, score: pts, detail });
    score += pts;
  };

  // 1. 새 기기
  if (isNewDevice) add('NEW_DEVICE', 15, '처음 보는 기기/브라우저');

  // 2. 알 수 없는 IP
  if (!ip || ip === 'unknown') add('UNKNOWN_IP', 15, 'IP 추출 불가');

  // 3. 비정상 시간대 (UTC 새벽 1–5시)
  if (isNightHour()) add('ODD_HOUR', 20, `UTC ${new Date().getUTCHours()}시`);

  // 4. UA/서브넷 변화 감지 (같은 IP에서 다른 UA 또는 서브넷)
  const prevHistory = ipHistory.get(ip);
  const currentSubnet = toSubnet(ip);
  if (prevHistory) {
    const elapsed = Date.now() - prevHistory.ts;
    const FAST_MS = 10 * 60 * 1000; // 10분
    if (elapsed < FAST_MS) {
      if (prevHistory.ua !== userAgent) {
        add('UA_CHANGE', 20, `${prevHistory.ua.slice(0, 40)} → ${userAgent.slice(0, 40)}`);
      }
      if (prevHistory.subnet !== currentSubnet) {
        add('SUBNET_CHANGE', 25, `${prevHistory.subnet}.x.x → ${currentSubnet}.x.x`);
      }
    }
  }
  // 현재 방문 기록
  safeMapSet(ipHistory, ip, { ua: userAgent, subnet: currentSubnet, ts: Date.now() }, IP_HISTORY_MAX);

  // 5. 토큰 재사용 의심 IP
  if (tokenReuseIps.has(ip)) add('TOKEN_REUSE', 40, '이전에 토큰 재사용 시도 감지됨');

  // 6. 허니팟 접근 이력
  const honeypotRec = honeypotHistory.get(ip);
  if (honeypotRec) {
    const pts = Math.min(35 + honeypotRec.count * 5, 60);
    add('HONEYPOT_HISTORY', pts, `허니팟 접근 ${honeypotRec.count}회`);
  }

  // 7. 관리자 경로 burst
  if (adminBurstIps.has(ip) && pathname?.startsWith('/api/admin')) {
    add('ADMIN_BURST', 30, '관리자 경로 burst 요청 이력');
  }

  // ── 레벨 / 액션 결정 ──
  let level: RiskLevel;
  let action: RiskResult['action'];

  if (score >= 80) {
    level = 'critical';
    action = 'criticalBlock';
  } else if (score >= 60) {
    level = 'high';
    action = 'tempBlock';
  } else if (score >= 30) {
    level = 'medium';
    action = 'stepUp';
  } else {
    level = 'low';
    action = 'allow';
  }

  // ── 사이드이펙트 ──
  if (action === 'criticalBlock' || action === 'tempBlock') {
    sendSecurityAlert({
      title: `Risk Score ${action === 'criticalBlock' ? 'Critical' : 'High'}: ${score}점`,
      message: `이상행위 탐지 — IP: ${ip}`,
      severity: action === 'criticalBlock' ? 'critical' : 'error',
      fields: {
        IP: ip,
        Score: String(score),
        Signals: signals.map((s) => `${s.type}(+${s.score})`).join(', '),
        ...(userId ? { UserID: userId } : {}),
        ...(pathname ? { Path: pathname } : {}),
      },
    });

    audit({
      event_type: 'SUSPICIOUS_ACTIVITY',
      severity: action === 'criticalBlock' ? 'critical' : 'error',
      user_id: userId,
      ip,
      details: { score, level, signals: signals.map((s) => s.type) },
    });
  }

  return { score, level, signals, action };
}

// ── 미들웨어 헬퍼 ──
export function riskActionToHttpStatus(action: RiskResult['action']): number | null {
  if (action === 'criticalBlock' || action === 'tempBlock') return 429;
  return null; // allow / stepUp은 상위에서 처리
}

// ── 주기적 정리 (10분마다) ──
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__riskScoreCleanup === 'undefined') {
  (globalThis as any).__riskScoreCleanup = true;
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30분 이상 지난 기록 삭제
    for (const [ip, rec] of ipHistory) {
      if (rec.ts < cutoff) ipHistory.delete(ip);
    }
    for (const [ip, rec] of honeypotHistory) {
      if (rec.lastTs < cutoff) honeypotHistory.delete(ip);
    }
    // tokenReuseIps / adminBurstIps는 세션 주기 전체 유지 (의도적)
  }, 10 * 60 * 1000);
}
