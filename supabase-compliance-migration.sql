-- ============================================================
-- Pick-My-AI 법적 준수 마이그레이션
-- Supabase SQL Editor에서 실행 (supabase-setup.sql, supabase-security-migration.sql 이후)
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [1] 전자상거래법 제6조: 거래 기록 5년 보존 의무
--     transactions 테이블의 ON DELETE CASCADE를 제거하여
--     사용자 계정 삭제 시에도 결제 기록이 보존되도록 함
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 기존 CASCADE FK 제거 후 SET NULL로 재생성
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id)
  ON DELETE SET NULL;

-- user_id를 nullable로 변경 (탈퇴 후에도 행 보존)
ALTER TABLE public.transactions
  ALTER COLUMN user_id DROP NOT NULL;

-- 결제 기록에 보존 만료일 컬럼 추가 (5년 후 자동 삭제 기준)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ;

-- 기존 purchase 기록에 5년 보존 기한 설정
UPDATE public.transactions
  SET retention_expires_at = created_at + INTERVAL '5 years'
  WHERE type = 'purchase' AND retention_expires_at IS NULL;

-- 새 purchase 레코드에 자동으로 5년 보존 기한 설정하는 트리거
CREATE OR REPLACE FUNCTION set_transaction_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'purchase' AND NEW.retention_expires_at IS NULL THEN
    NEW.retention_expires_at := NEW.created_at + INTERVAL '5 years';
  END IF;
  IF NEW.type = 'usage' AND NEW.retention_expires_at IS NULL THEN
    -- usage 로그는 1년 보존 (전자상거래법 대상 아닌 이용 기록)
    NEW.retention_expires_at := NEW.created_at + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_retention ON public.transactions;
CREATE TRIGGER trg_transaction_retention
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_retention();

-- 보존 기한 만료된 레코드만 삭제하는 안전한 정리 함수
CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.transactions
  WHERE retention_expires_at IS NOT NULL
    AND retention_expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_expired_transactions() TO service_role;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [2] 정보통신망법 시행령 제15조: 접속 기록 최소 6개월 보관
--     audit_logs의 자동 삭제를 90일 → 6개월(180일)로 변경
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 기존 90일 삭제 작업 제거
    PERFORM cron.unschedule('cleanup-old-audit-logs');

    -- 6개월(180일)로 재등록
    PERFORM cron.schedule(
      'cleanup-old-audit-logs',
      '0 3 * * *',
      $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '180 days'$$
    );

    -- 만료된 거래 기록 정리 (매일 새벽 4시)
    PERFORM cron.schedule(
      'cleanup-expired-transactions',
      '0 4 * * *',
      $$SELECT cleanup_expired_transactions()$$
    );
  END IF;
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- [3] 개인정보보호법: 회원 탈퇴 시 개인정보 분리 보관
--     탈퇴 처리 함수 — 개인정보는 즉시 삭제하되 거래 기록은 보존
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION withdraw_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_count INTEGER;
BEGIN
  -- 1. 거래 기록의 user_id를 NULL로 설정 (기록은 보존, 개인 연결 해제)
  UPDATE public.transactions
    SET user_id = NULL
    WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tx_count = ROW_COUNT;

  -- 2. 개인정보 포함 데이터 즉시 삭제
  DELETE FROM public.user_settings WHERE user_id = p_user_id;
  DELETE FROM public.user_wallets WHERE user_id = p_user_id;
  DELETE FROM public.chat_sessions WHERE user_id = p_user_id;

  -- 3. users 테이블 삭제 (Supabase Auth 삭제는 앱 코드에서 처리)
  DELETE FROM public.users WHERE id = p_user_id;

  -- 4. 감사 로그 기록
  INSERT INTO public.audit_logs (event_type, severity, user_id, details)
  VALUES ('ACCOUNT_WITHDRAWAL', 'info', p_user_id::TEXT,
    jsonb_build_object(
      'preserved_transactions', v_tx_count,
      'withdrawn_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'preserved_transactions', v_tx_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION withdraw_user(UUID) TO service_role;
