-- ============================================================
-- PickMyAI 보안 강화 마이그레이션
-- 1. admin_mfa 테이블 (관리자 MFA 상태)
-- 2. RLS 정책 (행 수준 보안)
-- 3. 감사 로그 테이블 (이미 존재하면 스킵)
-- ============================================================

-- ── 1. admin_mfa 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_mfa (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id              TEXT UNIQUE NOT NULL,
  totp_enabled          BOOLEAN DEFAULT false NOT NULL,
  totp_secret_enc       TEXT,                        -- AES-256-GCM 암호화된 TOTP 시크릿
  recovery_codes_hashed TEXT[] DEFAULT '{}' NOT NULL, -- SHA-256 해시된 Recovery codes
  webauthn_credentials  JSONB DEFAULT '[]' NOT NULL,  -- WebAuthn Passkey 자격증명
  setup_completed_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_admin_mfa_updated_at ON admin_mfa;
CREATE TRIGGER update_admin_mfa_updated_at
  BEFORE UPDATE ON admin_mfa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. audit_logs 테이블 (없으면 생성) ──────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  user_id     TEXT,
  ip          TEXT,
  user_agent  TEXT,
  device_id   TEXT,
  details     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type   ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip     ON audit_logs(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sev    ON audit_logs(severity, created_at DESC);

-- ── 3. RLS 활성화 ────────────────────────────────────────────

-- 3-a. admin_mfa: Service Role만 접근 가능 (일반 사용자 완전 차단)
ALTER TABLE admin_mfa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_mfa_deny_all ON admin_mfa;
CREATE POLICY admin_mfa_deny_all ON admin_mfa
  FOR ALL
  USING (false);   -- anon/authenticated 모두 차단, service_role은 RLS 우회

-- 3-b. audit_logs: Service Role만 INSERT/SELECT 가능
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_deny_all ON audit_logs;
CREATE POLICY audit_logs_deny_all ON audit_logs
  FOR ALL
  USING (false);

-- 3-c. users 테이블 (이미 존재하는 경우)
-- 사용자 본인 데이터만 읽기/수정 허용
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN

    ALTER TABLE users ENABLE ROW LEVEL SECURITY;

    -- 본인 행만 SELECT
    DROP POLICY IF EXISTS users_select_own ON users;
    CREATE POLICY users_select_own ON users
      FOR SELECT
      USING (auth.uid()::text = id);

    -- 본인 행만 UPDATE (id 변경 불가)
    DROP POLICY IF EXISTS users_update_own ON users;
    CREATE POLICY users_update_own ON users
      FOR UPDATE
      USING (auth.uid()::text = id)
      WITH CHECK (auth.uid()::text = id);

    -- INSERT: 자신의 행만 (회원가입 시)
    DROP POLICY IF EXISTS users_insert_own ON users;
    CREATE POLICY users_insert_own ON users
      FOR INSERT
      WITH CHECK (auth.uid()::text = id);

    -- DELETE: 차단 (계정 삭제는 service_role으로만)
    DROP POLICY IF EXISTS users_delete_deny ON users;
    CREATE POLICY users_delete_deny ON users
      FOR DELETE
      USING (false);

  END IF;
END;
$$;

-- 3-d. chat_sessions 테이블 (이미 존재하는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_sessions') THEN

    ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

    -- 본인 세션만 SELECT/INSERT/UPDATE
    DROP POLICY IF EXISTS chat_sessions_own ON chat_sessions;
    CREATE POLICY chat_sessions_own ON chat_sessions
      FOR ALL
      USING (auth.uid()::text = user_id)
      WITH CHECK (auth.uid()::text = user_id);

  END IF;
END;
$$;

-- 3-e. messages 테이블 (이미 존재하는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN

    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

    -- 세션 소유자만 메시지 접근 (chat_sessions를 통한 간접 확인)
    DROP POLICY IF EXISTS messages_own_session ON messages;
    CREATE POLICY messages_own_session ON messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM chat_sessions cs
          WHERE cs.id = messages.session_id
            AND cs.user_id = auth.uid()::text
        )
      );

  END IF;
END;
$$;

-- 3-f. wallet / credits 테이블 (이미 존재하는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet') THEN

    ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;

    -- 본인 지갑만 읽기 허용 (수정은 service_role으로만)
    DROP POLICY IF EXISTS wallet_select_own ON wallet;
    CREATE POLICY wallet_select_own ON wallet
      FOR SELECT
      USING (auth.uid()::text = user_id);

    DROP POLICY IF EXISTS wallet_modify_deny ON wallet;
    CREATE POLICY wallet_modify_deny ON wallet
      FOR ALL
      USING (false)
      WITH CHECK (false);

  END IF;
END;
$$;

-- ── 4. 권한 최소화: anon/authenticated 역할 권한 제거 ────────
-- admin_mfa는 service_role만 사용
REVOKE ALL ON admin_mfa FROM anon, authenticated;
REVOKE ALL ON audit_logs FROM anon;
GRANT SELECT ON audit_logs TO authenticated; -- 읽기는 허용하되 RLS로 필터링

-- ── 5. 주기적 audit_logs 정리 (90일 이상 된 로그 삭제) ──────
-- pg_cron 사용 가능 환경에서만 동작
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-old-audit-logs',
      '0 3 * * *',  -- 매일 새벽 3시
      $$DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'$$
    );
  END IF;
END;
$$;
