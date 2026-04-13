-- Discord 관제소 연동: 영구 IP 차단 테이블
CREATE TABLE IF NOT EXISTS ip_bans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT DEFAULT '',
  banned_by TEXT DEFAULT 'system',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_ip_bans_active ON ip_bans (ip) WHERE is_active = true;

-- RLS
ALTER TABLE ip_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ip_bans"
  ON ip_bans FOR ALL
  USING (auth.role() = 'service_role');
