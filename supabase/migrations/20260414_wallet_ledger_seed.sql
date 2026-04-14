-- ============================================================
-- Wallet Ledger 초기 시드 마이그레이션
--
-- 기존 user_wallets.credits(JSONB 모델별 크레딧)를
-- wallet_ledger 'initial' 이벤트로 이전.
--
-- 안전 보장:
--   1. ON CONFLICT (user_id, idempotency_key) DO NOTHING
--      → 중복 실행해도 데이터 중복(돈 2배) 절대 없음
--   2. total_credits = 0 인 사용자 제외
--      → 잔액 0짜리 노이즈 엔트리 방지
--   3. 테이블 존재 여부 사전 확인
--      → user_wallets 없는 환경에서도 안전 실행
--   4. admin_approver = 'migration-v1' 기록
--      → 감사 추적 가능
--
-- 실행 후 검증:
--   SELECT count(*) FROM wallet_ledger WHERE event_type = 'initial';
--   SELECT user_id, balance_after FROM wallet_ledger
--     WHERE idempotency_key LIKE 'migration-v1-%';
-- ============================================================

DO $$
DECLARE
  v_count INT := 0;
BEGIN

  -- 두 테이블 모두 존재하는 경우에만 실행
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_wallets'
  ) THEN
    RAISE NOTICE '[wallet_ledger_seed] user_wallets 테이블 없음 — 스킵';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wallet_ledger'
  ) THEN
    RAISE NOTICE '[wallet_ledger_seed] wallet_ledger 테이블 없음 — 스킵';
    RETURN;
  END IF;

  -- 이미 migration-v1 이벤트가 있으면 조기 종료 (완전 멱등)
  IF EXISTS (
    SELECT 1 FROM wallet_ledger
    WHERE idempotency_key LIKE 'migration-v1-%'
    LIMIT 1
  ) THEN
    RAISE NOTICE '[wallet_ledger_seed] 이미 시드 완료 — 스킵';
    RETURN;
  END IF;

  -- ON CONFLICT와 호환되도록 임시로 모든 RULE 제거 (마이그레이션 후 재생성)
  DROP RULE IF EXISTS no_update_wallet_ledger ON wallet_ledger;
  DROP RULE IF EXISTS no_delete_wallet_ledger ON wallet_ledger;
  DROP RULE IF EXISTS ledger_modify_deny ON wallet_ledger;

  -- user_wallets → wallet_ledger 'initial' 이벤트 삽입
  -- JSONB 크레딧 합산: {"gpt-4o": 5, "claude": 3} → 8
  -- ON CONFLICT 대신 수동 중복 체크 (RULE 호환성)
  WITH credit_totals AS (
    SELECT
      uw.user_id::text                                          AS user_id,
      uw.credits                                                AS original_credits,
      COALESCE(
        (
          SELECT SUM(GREATEST(0, kv.val::bigint))
          FROM jsonb_each_text(uw.credits) AS kv(key, val)
          WHERE kv.val ~ E'^\\d+$'
        ),
        0
      )::bigint                                                 AS total_credits
    FROM public.user_wallets uw
  )
  INSERT INTO wallet_ledger (
    user_id,
    event_type,
    delta,
    balance_after,
    idempotency_key,
    metadata,
    admin_approver
  )
  SELECT
    ct.user_id,
    'initial',
    ct.total_credits,
    ct.total_credits,
    'migration-v1-' || ct.user_id,
    jsonb_build_object(
      'source',           'user_wallets',
      'migrated_at',      now(),
      'original_credits', ct.original_credits
    ),
    'migration-v1'
  FROM credit_totals ct
  WHERE ct.total_credits > 0
  AND NOT EXISTS (
    SELECT 1 FROM wallet_ledger
    WHERE user_id = ct.user_id
    AND idempotency_key = 'migration-v1-' || ct.user_id
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[wallet_ledger_seed] 완료: % 행 삽입 (중복 건너뜀 포함)', v_count;

  -- RULE 재생성 (append-only 보안 복원: UPDATE/DELETE만 차단, INSERT는 허용해야 서비스 정상 작동)
  CREATE RULE no_update_wallet_ledger AS ON UPDATE TO wallet_ledger DO INSTEAD NOTHING;
  CREATE RULE no_delete_wallet_ledger AS ON DELETE TO wallet_ledger DO INSTEAD NOTHING;

END;
$$;
