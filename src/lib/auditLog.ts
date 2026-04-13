import { supabase } from './supabase';
import type { RiskDecision, RiskScope, RiskSignal } from './security/riskTypes';
import crypto from 'crypto';

/**
 * 감사 로그 시스템 (Production-Grade)
 *
 * 기존 audit_logs 테이블은 하위 호환을 위해 유지하고,
 * 새로운 security_audits 테이블에 다차원 리스크 엔진의 판단 결과를 기록한다.
 *
 * 핵심 원칙:
 *   - Append-only
 *   - Tamper-evident hash chain
 *   - 비밀값·원문 토큰 저장 금지
 *   - 민감정보는 해시/마스킹
 *   - Shadow 진입과 해제 모두 로그 의무화
 */

export type AuditEventType =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_FAILURE'
  | 'AUTH_REGISTER'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REVOKED'
  | 'TOKEN_REUSE_DETECTED'
  | 'PASSWORD_CHANGE'
  | 'SESSION_CREATED'
  | 'SESSION_DESTROYED'
  | 'RATE_LIMIT_HIT'
  | 'CSRF_VIOLATION'
  | 'HONEYPOT_TRIGGERED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'UNAUTHORIZED_ACCESS'
  | 'ADMIN_ACTION'
  | 'DATA_EXPORT'
  | 'ACCOUNT_DELETED'
  | 'IP_BANNED'
  | 'DEVICE_NEW'
  | 'LOCATION_CHANGE';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface AuditEntry {
  event_type: AuditEventType;
  severity: AuditSeverity;
  user_id?: string;
  ip?: string;
  user_agent?: string;
  device_id?: string;
  details?: Record<string, unknown>;
}

// ── 인메모리 배치 버퍼 ──
const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10_000; // 10초
let buffer: AuditEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, BATCH_SIZE * 5); // 최대 100개씩

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Supabase 미설정 시 콘솔 출력만
    if (process.env.NODE_ENV !== 'production') {
      for (const entry of batch) {
        console.log('[AuditLog]', entry.event_type, entry.severity, entry.details);
      }
    }
    return;
  }

  try {
    const rows = batch.map(entry => ({
      event_type: entry.event_type,
      severity: entry.severity,
      user_id: entry.user_id || null,
      ip: entry.ip || null,
      user_agent: entry.user_agent?.slice(0, 500) || null,
      device_id: entry.device_id || null,
      details: entry.details || {},
    }));

    const { error } = await supabase.from('audit_logs').insert(rows);
    if (error && process.env.NODE_ENV !== 'production') {
      console.error('[AuditLog] flush error:', error.message);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AuditLog] flush exception:', err);
    }
  }
}

/**
 * 감사 로그 기록 (비동기, 논블로킹)
 */
export function audit(entry: AuditEntry): void {
  buffer.push(entry);

  // 배치 크기 도달 시 즉시 플러시
  if (buffer.length >= BATCH_SIZE) {
    flushBuffer();
  } else {
    scheduleFlush();
  }

  // critical 이벤트는 콘솔에도 즉시 출력
  if (entry.severity === 'critical') {
    console.error('[AUDIT CRITICAL]', entry.event_type, entry.user_id, entry.ip, entry.details);
  }
}

/**
 * 특정 사용자의 최근 감사 로그 조회
 */
export async function getUserAuditLogs(
  userId: string,
  limit = 50
): Promise<AuditEntry[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as AuditEntry[]) || [];
}

/**
 * 특정 IP의 최근 실패 횟수
 */
export async function getFailureCountByIp(
  ip: string,
  windowMinutes = 15
): Promise<number> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 0;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('event_type', 'AUTH_FAILURE')
    .gte('created_at', since);
  return count || 0;
}

/**
 * 프로세스 종료 시 잔여 버퍼 플러시
 */
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('beforeExit', () => { flushBuffer(); flushSecurityBuffer(); });
}

// ══════════════════════════════════════════════════════════════
// Production-Grade Security Audit (security_audits 테이블)
// ══════════════════════════════════════════════════════════════

export type SecurityDecision = RiskDecision;

export interface SecurityAuditEntry {
  correlation_id: string;
  decision: SecurityDecision;
  reason: string;
  score_total: number;
  score_breakdown: Record<string, number>;          // { "L3": 40, "L9": 90 }
  scope_snapshot: Partial<Record<RiskScope, number>>;
  triggered_layers: number[];
  user_id?: string;
  session_id?: string;
  ip?: string;
  user_agent?: string;
  device_hash?: string;
  request_method?: string;
  request_path?: string;
  request_summary?: Record<string, unknown>;
  shadow_reason?: string;
  freeze_reason?: string;
  operator_action?: string;
}

// ── security_audits 배치 버퍼 ──
const SEC_BATCH_SIZE = 10;
const SEC_FLUSH_INTERVAL_MS = 5_000;
let secBuffer: SecurityAuditEntry[] = [];
let secFlushTimer: ReturnType<typeof setTimeout> | null = null;

// ── Tamper-evident hash chain ──
let lastEntryHash = 'GENESIS';

function computeEntryHash(entry: SecurityAuditEntry, prevHash: string): string {
  const payload = JSON.stringify({
    correlation_id: entry.correlation_id,
    decision: entry.decision,
    score_total: entry.score_total,
    triggered_layers: entry.triggered_layers,
    user_id: entry.user_id,
    ip: entry.ip,
    prevHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function scheduleSecFlush(): void {
  if (secFlushTimer) return;
  secFlushTimer = setTimeout(() => {
    secFlushTimer = null;
    flushSecurityBuffer();
  }, SEC_FLUSH_INTERVAL_MS);
}

async function flushSecurityBuffer(): Promise<void> {
  if (secBuffer.length === 0) return;
  const batch = secBuffer.splice(0, SEC_BATCH_SIZE * 5);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (process.env.NODE_ENV !== 'production') {
      for (const entry of batch) {
        console.log('[SecurityAudit]', entry.decision, entry.score_total, entry.reason);
      }
    }
    return;
  }

  try {
    const rows = batch.map(entry => {
      const prevHash = lastEntryHash;
      const entryHash = computeEntryHash(entry, prevHash);
      lastEntryHash = entryHash;

      return {
        correlation_id: entry.correlation_id,
        decision: entry.decision,
        reason: entry.reason?.slice(0, 2000) || null,
        score_total: entry.score_total,
        score_breakdown: entry.score_breakdown || {},
        scope_snapshot: entry.scope_snapshot || {},
        triggered_layers: entry.triggered_layers || [],
        user_id: entry.user_id || null,
        session_id: entry.session_id || null,
        ip: entry.ip || null,
        user_agent: entry.user_agent?.slice(0, 500) || null,
        device_hash: entry.device_hash || null,
        request_method: entry.request_method || null,
        request_path: entry.request_path?.slice(0, 500) || null,
        request_summary: entry.request_summary || {},
        shadow_reason: entry.shadow_reason || null,
        freeze_reason: entry.freeze_reason || null,
        operator_action: entry.operator_action || null,
        prev_hash: prevHash,
        entry_hash: entryHash,
      };
    });

    const { error } = await supabase.from('security_audits').insert(rows);
    if (error && process.env.NODE_ENV !== 'production') {
      console.error('[SecurityAudit] flush error:', error.message);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SecurityAudit] flush exception:', err);
    }
  }
}

/**
 * Production-Grade 보안 감사 로그 기록
 */
export function securityAudit(entry: SecurityAuditEntry): void {
  secBuffer.push(entry);

  if (secBuffer.length >= SEC_BATCH_SIZE) {
    flushSecurityBuffer();
  } else {
    scheduleSecFlush();
  }

  if (entry.decision === 'shadow' || entry.decision === 'vault') {
    console.error(
      '[SECURITY AUDIT]', entry.decision.toUpperCase(),
      entry.correlation_id, entry.user_id, entry.ip,
      entry.reason?.slice(0, 200),
    );
  }
}

/**
 * correlation_id 생성 유틸리티
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * 리스크 엔진 결과를 SecurityAuditEntry로 변환하는 헬퍼
 */
export function buildSecurityAuditFromRisk(
  correlationId: string,
  decision: SecurityDecision,
  reason: string,
  totalScore: number,
  signals: RiskSignal[],
  scopeScores: Partial<Record<RiskScope, number>>,
  context: {
    userId?: string;
    sessionId?: string;
    ip?: string;
    userAgent?: string;
    deviceHash?: string;
    method?: string;
    path?: string;
    shadowReason?: string;
    freezeReason?: string;
  },
): SecurityAuditEntry {
  const scoreBreakdown: Record<string, number> = {};
  const triggeredLayers = new Set<number>();

  for (const sig of signals) {
    const key = `L${sig.layer}:${sig.type}`;
    scoreBreakdown[key] = (scoreBreakdown[key] || 0) + sig.score;
    triggeredLayers.add(sig.layer);
  }

  return {
    correlation_id: correlationId,
    decision,
    reason,
    score_total: totalScore,
    score_breakdown: scoreBreakdown,
    scope_snapshot: scopeScores,
    triggered_layers: Array.from(triggeredLayers).sort((a, b) => a - b),
    user_id: context.userId,
    session_id: context.sessionId,
    ip: context.ip,
    user_agent: context.userAgent,
    device_hash: context.deviceHash,
    request_method: context.method,
    request_path: context.path,
    shadow_reason: context.shadowReason,
    freeze_reason: context.freezeReason,
  };
}
