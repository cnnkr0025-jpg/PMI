import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';

// 모든 유저와 크레딧 정보 조회
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인 (토큰 검증)
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
    }

    // users와 user_wallets 조인하여 조회 (관리자 권한으로)
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        created_at,
        user_wallets (
          credits,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 특정 유저의 크레딧 수정
export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 토큰입니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const credits = body?.credits;

    if (!userId || !credits || typeof credits !== 'object' || Array.isArray(credits)) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    // user_wallets 테이블 업데이트 (관리자 권한으로)
    const { data, error } = await supabaseAdmin
      .from('user_wallets')
      .update({
        credits,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error updating credits:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
