/**
 * PickMyAI Wallet Ledger — Types
 *
 * Append-only 이벤트 장부 기반 자산 모델.
 * 절대 불변식:
 *   - 초기잔액 + 충전 + 적립 - 사용 - 환불 = 현재잔액
 *   - 승인되지 않은 직접 balance update 불가
 *   - 중복 commit 불가
 *   - 동일 intent 재사용 불가
 *   - 음수 잔액 불가
 */

export type LedgerEventType =
  | 'initial'         // 최초 잔액 설정
  | 'charge'          // 충전 (결제)
  | 'earn'            // 적립 (PMC 리워드 등)
  | 'reserve'         // 예약 (사용 전 잠금)
  | 'commit'          // 확정 (예약된 금액 차감)
  | 'cancel'          // 취소 (예약 해제)
  | 'refund'          // 환불
  | 'admin_credit'    // 관리자 수동 증액
  | 'admin_debit';    // 관리자 수동 감액

export interface LedgerEntry {
  id: string;
  user_id: string;
  event_type: LedgerEventType;
  /** 양수 = 증가, 음수 = 감소 */
  delta: number;
  /** 이 이벤트 후 잔액 */
  balance_after: number;
  /** 멱등성 키 — 중복 commit 방지 */
  idempotency_key: string;
  /** Layer 11 액션 인텐트 토큰 ID (선택) */
  intent_token_id?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
  /** admin mutation 승인자 (admin_credit/admin_debit 시 필수) */
  admin_approver?: string;
  created_at: string;
}

export interface ReserveResult {
  success: boolean;
  reservationId?: string;
  error?: string;
}

export interface CommitResult {
  success: boolean;
  ledgerEntryId?: string;
  balanceAfter?: number;
  error?: string;
}

export interface LedgerIntegrityCheckResult {
  valid: boolean;
  expectedBalance: number;
  actualBalance: number;
  discrepancy: number;
  userId: string;
}
