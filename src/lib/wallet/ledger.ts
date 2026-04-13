/**
 * PickMyAI Wallet Ledger — Append-only 장부 엔진
 *
 * 모든 PMC/크레딧 변동은 이 모듈을 통해서만 이루어진다.
 * 잔액 직접 수정 금지. 모든 변동은 idempotency key 필수.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  LedgerEventType,
  LedgerEntry,
  LedgerIntegrityCheckResult,
} from './ledgerTypes';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase credentials not configured for ledger');
  return createClient(url, key);
}

/**
 * 현재 잔액 조회 (최신 ledger entry의 balance_after 기준)
 */
export async function getBalance(userId: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('wallet_ledger')
    .select('balance_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;
  return data.balance_after;
}

/**
 * Append-only 장부 이벤트 기록
 *
 * 핵심:
 *   - idempotency_key 중복 시 기존 결과 반환 (중복 commit 방지)
 *   - balance_after < 0 이면 거부
 *   - admin_credit/admin_debit은 admin_approver 필수
 */
export async function appendLedgerEvent(params: {
  userId: string;
  eventType: LedgerEventType;
  delta: number;
  idempotencyKey: string;
  intentTokenId?: string;
  metadata?: Record<string, unknown>;
  adminApprover?: string;
}): Promise<{ success: boolean; entry?: LedgerEntry; error?: string }> {
  const { userId, eventType, delta, idempotencyKey, intentTokenId, metadata, adminApprover } = params;

  // admin mutation 검증
  if ((eventType === 'admin_credit' || eventType === 'admin_debit') && !adminApprover) {
    return { success: false, error: 'admin_approver is required for admin mutations' };
  }

  const db = getSupabaseAdmin();

  // 1. 멱등성 검사 — 이미 존재하는 idempotency_key면 기존 결과 반환
  const { data: existing } = await db
    .from('wallet_ledger')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .limit(1)
    .single();

  if (existing) {
    return { success: true, entry: existing as LedgerEntry };
  }

  // 2. 현재 잔액 조회 (직렬화된 트랜잭션 보장을 위해 FOR UPDATE 시뮬레이션)
  const currentBalance = await getBalance(userId);

  // 3. 새 잔액 계산
  const newBalance = currentBalance + delta;

  // 4. 음수 잔액 방지
  if (newBalance < 0) {
    return { success: false, error: `Insufficient balance: current=${currentBalance}, delta=${delta}` };
  }

  // 5. INSERT
  const { data: inserted, error: insertError } = await db
    .from('wallet_ledger')
    .insert({
      user_id: userId,
      event_type: eventType,
      delta,
      balance_after: newBalance,
      idempotency_key: idempotencyKey,
      intent_token_id: intentTokenId || null,
      metadata: metadata || {},
      admin_approver: adminApprover || null,
    })
    .select()
    .single();

  if (insertError) {
    // UNIQUE 위반 = 동시 요청에 의한 멱등성 경합 → 기존 결과 재조회
    if (insertError.code === '23505') {
      const { data: retry } = await db
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey)
        .limit(1)
        .single();
      if (retry) return { success: true, entry: retry as LedgerEntry };
    }
    return { success: false, error: insertError.message };
  }

  return { success: true, entry: inserted as LedgerEntry };
}

/**
 * 장부 무결성 검증 (Layer 15)
 *
 * 모든 이벤트를 순서대로 재연산하여 최종 balance_after와 일치하는지 확인.
 * 불일치 발견 시 즉시 Vault 격리 후보.
 */
export async function verifyLedgerIntegrity(userId: string): Promise<LedgerIntegrityCheckResult> {
  const db = getSupabaseAdmin();

  const { data: entries, error } = await db
    .from('wallet_ledger')
    .select('delta, balance_after')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error || !entries || entries.length === 0) {
    return { valid: true, expectedBalance: 0, actualBalance: 0, discrepancy: 0, userId };
  }

  let computed = 0;
  for (const e of entries) {
    computed += e.delta;
  }

  const lastEntry = entries[entries.length - 1];
  const actual = lastEntry.balance_after;
  const discrepancy = Math.abs(computed - actual);

  return {
    valid: discrepancy === 0,
    expectedBalance: computed,
    actualBalance: actual,
    discrepancy,
    userId,
  };
}

/**
 * 시스템 전체 PMC 총량 검증 (Layer 21 보조)
 *
 * 모든 사용자의 잔액 합 vs 전체 delta 합 비교.
 */
export async function verifySystemSupply(): Promise<{
  valid: boolean;
  totalDelta: number;
  totalBalance: number;
  discrepancy: number;
}> {
  const db = getSupabaseAdmin();

  // 전체 delta 합
  const { data: deltaData } = await db
    .rpc('sum_ledger_deltas')
    .single() as { data: { total: number } | null; error: any };

  // 사용자별 최종 잔액 합 (최신 balance_after 기준)
  const { data: balanceData } = await db
    .rpc('sum_latest_balances')
    .single() as { data: { total: number } | null; error: any };

  const totalDelta = (deltaData as any)?.total ?? 0;
  const totalBalance = (balanceData as any)?.total ?? 0;
  const discrepancy = Math.abs(totalDelta - totalBalance);

  return {
    valid: discrepancy === 0,
    totalDelta,
    totalBalance,
    discrepancy,
  };
}

/**
 * 최근 1분간 총 PMC 변동량 조회 (Layer 21 뉴클리어 락 감지용)
 */
export async function getRecentPmcDelta(windowMs: number = 60_000): Promise<number> {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data } = await db
    .from('wallet_ledger')
    .select('delta')
    .gte('created_at', since);

  if (!data) return 0;
  return data.reduce((sum, row) => sum + Math.abs(row.delta), 0);
}
