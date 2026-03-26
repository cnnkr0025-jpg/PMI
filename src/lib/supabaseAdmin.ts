import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 자격증명 누락 시 경고 (서버 로그에만)
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[supabaseAdmin] Credentials not configured. Admin DB features will fail at runtime.');
}

// placeholder로 폴백 — createClient가 빈 문자열로 throw하는 것을 방지
// 실제 호출 시점(쿼리)에서 네트워크 오류로 떨어지며 상위 try/catch가 처리함
const FALLBACK_URL = 'https://placeholder-admin.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.placeholder-admin';

// 관리자용 Supabase 클라이언트 (Service Role Key 사용)
// RLS 정책을 우회하여 모든 데이터에 접근 가능
export const supabaseAdmin = createClient(
  supabaseUrl || FALLBACK_URL,
  supabaseServiceKey || FALLBACK_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/** 런타임에 자격증명이 실제로 설정되어 있는지 확인하는 헬퍼 */
export function isAdminDbAvailable(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}
