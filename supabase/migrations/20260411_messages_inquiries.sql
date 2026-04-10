-- 관리자 → 사용자 메시지 테이블
CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  to_user_id TEXT,  -- NULL = 전체 공지
  from_admin_email TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_messages_to_user ON admin_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created ON admin_messages(created_at DESC);

-- 메시지 읽음 추적 테이블
CREATE TABLE IF NOT EXISTS user_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES admin_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_reads_user ON user_message_reads(user_id);

-- 사용자 → 관리자 문의 테이블
CREATE TABLE IF NOT EXISTS user_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  type TEXT NOT NULL DEFAULT 'other', -- credit | pmc | model | other
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  screenshots JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_user ON user_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON user_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON user_inquiries(created_at DESC);
