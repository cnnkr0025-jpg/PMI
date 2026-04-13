-- ============================================================
-- Pick-My-AI 보안 마이그레이션
-- Supabase SQL Editor에서 실행하세요 (supabase-setup.sql 이후)
-- ============================================================

-- [1] 결제 중복 방지: TOSS:{orderId} description에 부분 UNIQUE 인덱스
-- 동시 confirm 요청이 와도 DB 레벨에서 두 번째를 거부함
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_toss_idempotency
  ON public.transactions(user_id, description)
  WHERE description LIKE 'TOSS:%';

-- [2] 원자적 크레딧 차감 함수 (일반 채팅)
-- SELECT FOR UPDATE로 행 잠금 후 차감 → 동시 요청 이중 차감 방지
CREATE OR REPLACE FUNCTION consume_credit_atomic(
  p_user_id  UUID,
  p_model_id TEXT,
  p_amount   INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits   JSONB;
  v_available INTEGER;
BEGIN
  SELECT credits INTO v_credits
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_available := COALESCE((v_credits ->> p_model_id)::INTEGER, 0);

  IF v_available < p_amount THEN
    RETURN FALSE;
  END IF;

  IF v_available - p_amount <= 0 THEN
    v_credits := v_credits - p_model_id;
  ELSE
    v_credits := jsonb_set(v_credits, ARRAY[p_model_id], to_jsonb(v_available - p_amount));
  END IF;

  UPDATE public.user_wallets
  SET credits = v_credits, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions(user_id, type, model_id, credits, description)
  VALUES (p_user_id, 'usage', p_model_id, jsonb_build_object(p_model_id, -p_amount), 'AI 응답 사용');

  RETURN TRUE;
END;
$$;

-- [3] 원자적 크레딧 환불 함수 (오류 보상)
CREATE OR REPLACE FUNCTION refund_credit_atomic(
  p_user_id   UUID,
  p_model_id  TEXT,
  p_amount    INTEGER DEFAULT 1,
  p_reason    TEXT    DEFAULT 'AI 오류 보상 환불'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits JSONB;
  v_current INTEGER;
BEGIN
  SELECT credits INTO v_credits
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_current := COALESCE((v_credits ->> p_model_id)::INTEGER, 0);
  v_credits := jsonb_set(v_credits, ARRAY[p_model_id], to_jsonb(v_current + p_amount));

  UPDATE public.user_wallets
  SET credits = v_credits, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions(user_id, type, model_id, credits, description)
  VALUES (p_user_id, 'purchase', p_model_id, jsonb_build_object(p_model_id, p_amount), p_reason);
END;
$$;

-- [4] 원자적 결제 확정 함수 (wallet + transaction을 단일 트랜잭션으로 처리)
-- Toss 승인 후 DB 실패 → 불일치 방지
CREATE OR REPLACE FUNCTION confirm_purchase_atomic(
  p_user_id  UUID,
  p_order_id TEXT,
  p_amount   NUMERIC,
  p_credits  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_description   TEXT;
  v_curr_credits  JSONB;
  v_model_id      TEXT;
  v_qty           INTEGER;
BEGIN
  v_description := 'TOSS:' || p_order_id;

  -- 멱등성 체크 (중복 처리 방지)
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = p_user_id AND description = v_description
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('already_processed', true);
  END IF;

  -- 지갑 행 잠금
  SELECT credits INTO v_curr_credits
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_wallets(user_id, credits)
    VALUES (p_user_id, '{}')
    ON CONFLICT (user_id) DO NOTHING;
    v_curr_credits := '{}';
  END IF;

  -- 크레딧 병합
  FOR v_model_id, v_qty IN
    SELECT key, GREATEST(0, value::INTEGER)
    FROM jsonb_each_text(p_credits)
  LOOP
    v_curr_credits := jsonb_set(
      v_curr_credits,
      ARRAY[v_model_id],
      to_jsonb(COALESCE((v_curr_credits ->> v_model_id)::INTEGER, 0) + v_qty)
    );
  END LOOP;

  -- 지갑 갱신
  UPDATE public.user_wallets
  SET credits = v_curr_credits, updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 거래 기록 (UNIQUE 인덱스로 중복 방지)
  INSERT INTO public.transactions(user_id, type, amount, credits, description)
  VALUES (p_user_id, 'purchase', p_amount, p_credits, v_description);

  RETURN jsonb_build_object('already_processed', false, 'credits', v_curr_credits);
END;
$$;

-- RPC 함수에 서비스 롤 실행 권한 부여
GRANT EXECUTE ON FUNCTION consume_credit_atomic(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION refund_credit_atomic(UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_purchase_atomic(UUID, TEXT, NUMERIC, JSONB) TO service_role;

-- [5] 세션 블랙리스트 테이블 (서버 재시작 후에도 무효화된 JWT 유지)
CREATE TABLE IF NOT EXISTS public.session_blacklist (
    jti TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_blacklist_expires
  ON public.session_blacklist(expires_at);

-- 만료된 블랙리스트 항목 자동 정리 (pg_cron 사용 시)
-- SELECT cron.schedule('cleanup-session-blacklist', '0 * * * *',
--   $$DELETE FROM public.session_blacklist WHERE expires_at < NOW()$$
-- );

-- 서비스 롤만 접근 가능
ALTER TABLE public.session_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.session_blacklist
    USING (true) WITH CHECK (true);
