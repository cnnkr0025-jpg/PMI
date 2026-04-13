import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';
import { logError } from '@/lib/apiError';

const VALID_PLANS = ['free', 'plus', 'pro', 'max'] as const;
type UserPlan = typeof VALID_PLANS[number];

// 모든 유저와 크레딧·플랜 정보 조회
export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
    }

    // users, user_wallets, user_settings 조인
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
        ),
        user_settings (
          data
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      logError('admin/users GET', error);
      return NextResponse.json({ error: '사용자 목록을 불러오는데 실패했습니다.' }, { status: 500 });
    }

    // user_settings.data에서 userPlan을 꺼내 응답에 포함
    const enriched = (users || []).map((u: any) => {
      const settingsData = u.user_settings?.[0]?.data || {};
      return {
        ...u,
        userPlan: (settingsData.userPlan as UserPlan) || 'free',
        user_settings: undefined,
      };
    });

    return NextResponse.json({ users: enriched });
  } catch (error) {
    logError('admin/users GET', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 특정 유저의 크레딧 및/또는 플랜 수정
export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 토큰입니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const credits = body?.credits;
    const userPlan: UserPlan | undefined = body?.userPlan;

    if (!userId || (!credits && !userPlan)) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다. (userId + credits 또는 userPlan)' }, { status: 400 });
    }

    // credits 업데이트
    if (credits !== undefined) {
      if (typeof credits !== 'object' || Array.isArray(credits)) {
        return NextResponse.json({ error: 'credits 형식이 올바르지 않습니다.' }, { status: 400 });
      }

      const { error: walletError } = await supabaseAdmin
        .from('user_wallets')
        .update({ credits, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (walletError) {
        logError('admin/users PATCH credits', walletError);
        return NextResponse.json({ error: '크레딧 업데이트에 실패했습니다.' }, { status: 500 });
      }
    }

    // userPlan 업데이트 (user_settings.data JSONB 내 필드만 교체)
    if (userPlan !== undefined) {
      if (!VALID_PLANS.includes(userPlan)) {
        return NextResponse.json({ error: `유효하지 않은 플랜입니다. (${VALID_PLANS.join(', ')})` }, { status: 400 });
      }

      // 기존 settings 읽기
      const { data: existing } = await supabaseAdmin
        .from('user_settings')
        .select('data')
        .eq('user_id', userId)
        .single();

      const currentData = (existing?.data as Record<string, any> | null) || {};
      const updatedData = { ...currentData, userPlan };

      const { error: settingsError } = await supabaseAdmin
        .from('user_settings')
        .upsert(
          { user_id: userId, data: updatedData, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (settingsError) {
        logError('admin/users PATCH userPlan', settingsError);
        return NextResponse.json({ error: '플랜 업데이트에 실패했습니다.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('admin/users PATCH', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
