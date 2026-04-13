import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { enforceTrustedOrigin, setNoStoreHeaders } from '@/lib/serverSecurity';
import { RateLimiter } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const withdrawRateLimiter = new RateLimiter(3, 60 * 60 * 1000);

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase config missing');
  return createClient(url, key);
}

/**
 * POST /api/auth/withdraw
 *
 * 개인정보보호법 제36조: 정보주체의 개인정보 삭제 요구권
 * 전자상거래법 제6조: 거래 기록 5년 보존 의무
 *
 * - 개인정보(이메일, 이름, 설정, 채팅 등)는 즉시 삭제
 * - 결제 기록(transactions)은 user_id를 NULL로 비식별화 후 5년 보존
 */
export async function POST(req: NextRequest) {
  try {
    const originError = enforceTrustedOrigin(req);
    if (originError) return originError;

    const session = await verifySession(req);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const rl = withdrawRateLimiter.check(session.userId);
    if (!rl.success) {
      return NextResponse.json({ error: '잠시 후 다시 시도해주세요.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (body?.confirm !== '탈퇴합니다') {
      return NextResponse.json(
        { error: '탈퇴를 확인하려면 confirm 필드에 "탈퇴합니다"를 입력해주세요.' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // withdraw_user RPC: 거래 기록 비식별화 보존 + 개인정보 삭제
    const { data, error } = await db.rpc('withdraw_user', { p_user_id: session.userId });
    if (error) {
      console.error('[withdraw] RPC error:', error);
      return NextResponse.json({ error: '탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // Supabase Auth에서 사용자 삭제
    const { error: authError } = await db.auth.admin.deleteUser(session.userId);
    if (authError) {
      console.error('[withdraw] Auth deletion error:', authError);
    }

    const res = setNoStoreHeaders(NextResponse.json({
      success: true,
      message: '회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.',
      preservedTransactions: data?.preserved_transactions ?? 0,
    }));

    res.cookies.set('session', '', { maxAge: 0, path: '/' });
    res.cookies.set('csrf-token', '', { maxAge: 0, path: '/' });

    return res;
  } catch (e) {
    console.error('[withdraw] Error:', e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
