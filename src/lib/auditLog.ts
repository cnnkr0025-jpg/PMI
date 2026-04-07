import { supabase } from './supabase';

/**
 * 감사 로그 시스템
 * - 모든 보안 관련 이벤트를 Supabase audit_logs 테이블에 기록
 * - 인메모리 배치 버퍼로 DB 쓰기 최적화
 * - 이상 행동 탐지 기초 데이터
 *
 * 필요한 Supabase 테이블:
 * CREATE TABLE audit_logs (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   event_type TEXT NOT NULL,
 *   severity TEXT NOT NULL DEFAULT 'info',
 *   user_id TEXT,
 *   ip TEXT,
 *   user_agent TEXT,
 *   device_id TEXT,
 *   details JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 * CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
 * CREATE INDEX idx_audit_logs_type ON audit_logs(event_type, created_at DESC);
 * CREATE INDEX idx_audit_logs_ip ON audit_logs(ip, created_at DESC);
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
  process.on('beforeExit', () => { flushBuffer(); });
}
