-- ============================================================
-- PickMyAI 21-Stage Security Architecture — DB Migration
-- 
-- 새 테이블:
--   1. security_audits (production-grade 감사 로그)
--   2. shadow_sessions (Shadow 격리 상태)
--   3. wallet_ledger (append-only 자산 장부)
--   4. action_intent_tokens (Layer 11 일회용 토큰)
--   5. system_freeze_log (Layer 21 뉴클리어 락)
--
-- 기존 audit_logs 테이블은 하위 호환을 위해 유지.
-- ============================================================

-- ── 1. security_audits ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS security_audits (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  correlation_id   UUID NOT NULL DEFAULT gen_random_uuid(),
  
  decision         TEXT NOT NULL CHECK (decision IN ('allow','observe','challenge','shadow','vault')),
  reason           TEXT,
  
  score_total      INT DEFAULT 0,
  score_breakdown  JSONB DEFAULT '{}',
  scope_snapshot   JSONB DEFAULT '{}',
  triggered_layers TEXT[] DEFAULT '{}',
  
  user_id          TEXT,
  session_id       TEXT,
  ip               TEXT,
  user_agent       TEXT,
  device_hash      TEXT,
  
  request_method   TEXT,
  request_path     TEXT,
  request_summary  JSONB DEFAULT '{}',
  
  shadow_reason    TEXT,
  freeze_reason    TEXT,
  operator_action  TEXT,
  
  prev_hash        TEXT,
  entry_hash       TEXT,
  
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sec_audits_user     ON security_audits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audits_ip       ON security_audits(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audits_decision ON security_audits(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audits_session  ON security_audits(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audits_corr     ON security_audits(correlation_id);

-- Append-only 강제
DROP RULE IF EXISTS no_update_security_audits ON security_audits;
CREATE RULE no_update_security_audits AS ON UPDATE TO security_audits DO INSTEAD NOTHING;
DROP RULE IF EXISTS no_delete_security_audits ON security_audits;
CREATE RULE no_delete_security_audits AS ON DELETE TO security_audits DO INSTEAD NOTHING;

-- RLS
ALTER TABLE security_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sec_audits_deny_all ON security_audits;
CREATE POLICY sec_audits_deny_all ON security_audits FOR ALL USING (false);

-- ── 2. shadow_sessions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS shadow_sessions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  
  entered_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  released_at      TIMESTAMPTZ,
  release_reason   TEXT,
  
  entry_score      INT NOT NULL DEFAULT 0,
  entry_reasons    TEXT[] NOT NULL DEFAULT '{}',
  entry_audit_id   UUID REFERENCES security_audits(id),
  
  synthetic_seed   BIGINT NOT NULL DEFAULT (extract(epoch from now()))::bigint,
  
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_shadow_active ON shadow_sessions(user_id) WHERE released_at IS NULL;

ALTER TABLE shadow_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shadow_deny_all ON shadow_sessions;
CREATE POLICY shadow_deny_all ON shadow_sessions FOR ALL USING (false);

-- ── 3. wallet_ledger ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT NOT NULL,
  
  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'initial','charge','earn','reserve','commit','cancel','refund','admin_credit','admin_debit'
                   )),
  delta            BIGINT NOT NULL,
  balance_after    BIGINT NOT NULL,
  
  idempotency_key  TEXT NOT NULL,
  intent_token_id  UUID,
  
  metadata         JSONB DEFAULT '{}',
  admin_approver   TEXT,
  
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(user_id, idempotency_key)
);

ALTER TABLE wallet_ledger ADD CONSTRAINT no_negative_balance CHECK (balance_after >= 0);

CREATE INDEX IF NOT EXISTS idx_ledger_user        ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON wallet_ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_type        ON wallet_ledger(event_type, created_at DESC);

-- Append-only 강제
DROP RULE IF EXISTS no_update_wallet_ledger ON wallet_ledger;
CREATE RULE no_update_wallet_ledger AS ON UPDATE TO wallet_ledger DO INSTEAD NOTHING;
DROP RULE IF EXISTS no_delete_wallet_ledger ON wallet_ledger;
CREATE RULE no_delete_wallet_ledger AS ON DELETE TO wallet_ledger DO INSTEAD NOTHING;

-- RLS: 본인만 읽기, 수정은 service_role만
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_select_own ON wallet_ledger;
CREATE POLICY ledger_select_own ON wallet_ledger
  FOR SELECT USING (auth.uid()::text = user_id);
-- ledger INSERT는 service_role이 RLS 우회하므로 별도 POLICY 불필요
-- (WITH CHECK (false)는 service_role도 차단하므로 제거)

-- ── 4. RPC: 총량 검증용 함수 ────────────────────────────────

CREATE OR REPLACE FUNCTION sum_ledger_deltas()
RETURNS TABLE(total BIGINT) AS $$
  SELECT COALESCE(SUM(delta), 0) AS total FROM wallet_ledger;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sum_latest_balances()
RETURNS TABLE(total BIGINT) AS $$
  SELECT COALESCE(SUM(balance_after), 0) AS total FROM (
    SELECT DISTINCT ON (user_id) balance_after
    FROM wallet_ledger
    ORDER BY user_id, created_at DESC
  ) latest;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 5. action_intent_tokens ─────────────────────────────────

CREATE TABLE IF NOT EXISTS action_intent_tokens (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  
  route            TEXT NOT NULL,
  method           TEXT NOT NULL,
  intent_type      TEXT NOT NULL,
  bound_params     JSONB NOT NULL DEFAULT '{}',
  idempotency_key  TEXT NOT NULL,
  
  issued_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_intent_token_user    ON action_intent_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_intent_token_expires ON action_intent_tokens(expires_at);

ALTER TABLE action_intent_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intent_token_deny_all ON action_intent_tokens;
CREATE POLICY intent_token_deny_all ON action_intent_tokens FOR ALL USING (false);

-- ── 6. system_freeze_log ────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_freeze_log (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  triggered_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  trigger_reason   TEXT NOT NULL,
  pmc_delta_1min   BIGINT,
  
  status           TEXT NOT NULL CHECK (status IN ('active','recovering','released')) DEFAULT 'active',
  
  required_signers INT NOT NULL DEFAULT 2,
  signatures       JSONB DEFAULT '[]',
  released_at      TIMESTAMPTZ,
  release_approver TEXT,
  
  audit_id         UUID REFERENCES security_audits(id)
);

ALTER TABLE system_freeze_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS freeze_deny_all ON system_freeze_log;
CREATE POLICY freeze_deny_all ON system_freeze_log FOR ALL USING (false);

-- ── 7. security_audits 정리 (90일 보존) ─────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-old-security-audits',
      '0 4 * * *',
      'DELETE FROM security_audits WHERE created_at < NOW() - INTERVAL ''90 days'''
    );
    PERFORM cron.schedule(
      'cleanup-expired-intent-tokens',
      '0 */6 * * *',
      'DELETE FROM action_intent_tokens WHERE expires_at < NOW() - INTERVAL ''1 day'''
    );
  END IF;
END;
$$;

-- ── 8. 권한 최소화 ──────────────────────────────────────────

REVOKE ALL ON security_audits FROM anon, authenticated;
REVOKE ALL ON shadow_sessions FROM anon, authenticated;
REVOKE ALL ON action_intent_tokens FROM anon, authenticated;
REVOKE ALL ON system_freeze_log FROM anon, authenticated;
GRANT SELECT ON wallet_ledger TO authenticated; -- 읽기는 RLS로 필터링
