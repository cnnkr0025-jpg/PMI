/**
 * PickMyAI Reserve → Commit → Cancel 2-Phase 자산 처리
 *
 * 비용 확정 전 잠금(reserve), 확정(commit), 취소(cancel) 흐름.
 * 멀티탭 정상 사용은 idempotency로 흡수.
 */

import { appendLedgerEvent, getBalance } from './ledger';
import type { ReserveResult, CommitResult } from './ledgerTypes';
import crypto from 'crypto';

// 인메모리 예약 저장소 (production에서는 Redis/DB 전환 권장)
interface Reservation {
  id: string;
  userId: string;
  amount: number;
  intentType: string;
  idempotencyKey: string;
  createdAt: number;
  expiresAt: number;
}

const reservations = new Map<string, Reservation>();
const RESERVATION_TTL_MS = 5 * 60 * 1000; // 5분
const RESERVATION_MAX = 50_000;

/**
 * 자산 예약 (reserve)
 * 실제 차감 전 잠금. balance 확인만 하고 실제 ledger에는 기록하지 않음.
 */
export async function reserve(params: {
  userId: string;
  amount: number;
  intentType: string;
  idempotencyKey: string;
}): Promise<ReserveResult> {
  const { userId, amount, intentType, idempotencyKey } = params;

  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  // 멱등성 — 이미 같은 키로 예약이 있으면 그 결과 반환
  const existingByKey = Array.from(reservations.values())
    .find(r => r.userId === userId && r.idempotencyKey === idempotencyKey);
  if (existingByKey) {
    return { success: true, reservationId: existingByKey.id };
  }

  // 현재 잔액 확인 (이미 예약된 금액 차감)
  const currentBalance = await getBalance(userId);
  const reservedAmount = Array.from(reservations.values())
    .filter(r => r.userId === userId && r.expiresAt > Date.now())
    .reduce((sum, r) => sum + r.amount, 0);

  const available = currentBalance - reservedAmount;

  if (available < amount) {
    return { success: false, error: `Insufficient available balance: available=${available}, requested=${amount}` };
  }

  // 예약 생성
  const now = Date.now();
  const reservationId = crypto.randomUUID();

  if (reservations.size >= RESERVATION_MAX) {
    // 만료된 예약 정리
    for (const [id, r] of reservations) {
      if (r.expiresAt < now) reservations.delete(id);
    }
    // 여전히 크면 가장 오래된 것 제거
    if (reservations.size >= RESERVATION_MAX) {
      const oldest = reservations.keys().next().value;
      if (oldest !== undefined) reservations.delete(oldest);
    }
  }

  reservations.set(reservationId, {
    id: reservationId,
    userId,
    amount,
    intentType,
    idempotencyKey,
    createdAt: now,
    expiresAt: now + RESERVATION_TTL_MS,
  });

  return { success: true, reservationId };
}

/**
 * 예약 확정 (commit) — 실제 ledger에 기록
 */
export async function commit(params: {
  reservationId: string;
  intentTokenId?: string;
  metadata?: Record<string, unknown>;
}): Promise<CommitResult> {
  const { reservationId, intentTokenId, metadata } = params;

  const reservation = reservations.get(reservationId);
  if (!reservation) {
    return { success: false, error: 'Reservation not found or expired' };
  }

  if (reservation.expiresAt < Date.now()) {
    reservations.delete(reservationId);
    return { success: false, error: 'Reservation expired' };
  }

  // ledger에 commit 기록
  const result = await appendLedgerEvent({
    userId: reservation.userId,
    eventType: 'commit',
    delta: -reservation.amount,
    idempotencyKey: reservation.idempotencyKey,
    intentTokenId,
    metadata: {
      ...metadata,
      reservationId,
      intentType: reservation.intentType,
    },
  });

  if (result.success) {
    reservations.delete(reservationId);
    return {
      success: true,
      ledgerEntryId: result.entry?.id,
      balanceAfter: result.entry?.balance_after,
    };
  }

  return { success: false, error: result.error };
}

/**
 * 예약 취소 (cancel)
 */
export function cancel(reservationId: string): { success: boolean; error?: string } {
  const reservation = reservations.get(reservationId);
  if (!reservation) {
    return { success: false, error: 'Reservation not found' };
  }
  reservations.delete(reservationId);
  return { success: true };
}

/**
 * 만료된 예약 정리 (주기적 호출)
 */
export function cleanupExpiredReservations(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, r] of reservations) {
    if (r.expiresAt < now) {
      reservations.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

// 주기적 정리 (1분마다)
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__reserveCleanup === 'undefined') {
  (globalThis as any).__reserveCleanup = true;
  setInterval(cleanupExpiredReservations, 60_000);
}
