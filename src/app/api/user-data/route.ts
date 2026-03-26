import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter } from '@/lib/rateLimit';

const userDataReadLimiter = new RateLimiter(30, 60 * 1000); // 분당 30회
const userDataWriteLimiter = new RateLimiter(20, 60 * 1000); // 분당 20회

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
  }
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. (Netlify 환경변수에 추가 필요)');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * GET /api/user-data
 * 로그인 시 사용자의 모든 영속 데이터를 한 번에 로드
 */
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const userId = session.userId;

    const rl = userDataReadLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const db = getSupabaseAdmin();

    // 지갑 로드
    let credits = {};
    try {
      const walletResult = await db.from('user_wallets').select('credits').eq('user_id', userId).single();
      if (walletResult.error?.code === 'PGRST116') {
        await db.from('user_wallets').insert({ user_id: userId, credits: {} });
      } else if (walletResult.data) {
        credits = walletResult.data.credits || {};
      }
    } catch {
      // 지갑 테이블 접근 실패 시 무시
    }

    // 설정 로드 (테이블이 없을 수 있음)
    let settings = null;
    try {
      const settingsResult = await db.from('user_settings').select('data').eq('user_id', userId).single();
      if (settingsResult.data) {
        settings = settingsResult.data.data || null;
      }
    } catch {
      // user_settings 테이블이 없으면 무시
    }

    return NextResponse.json({
      credits,
      settings,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('user-data GET error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/user-data
 * 사용자 설정 데이터를 Supabase에 저장 (upsert)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const userId = session.userId;

    const rl = userDataWriteLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const body = await request.json();
    const db = getSupabaseAdmin();

    // settings 데이터 저장 (upsert)
    if (body.settings !== undefined) {
      try {
        const { error } = await db
          .from('user_settings')
          .upsert(
            { user_id: userId, data: body.settings, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );

        if (error) {
          // 테이블이 없으면 생성 시도
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            // 테이블 없음 - 무시 (Supabase 대시보드에서 생성 필요)
            if (process.env.NODE_ENV !== 'production') {
              console.warn('user_settings 테이블이 없습니다. Supabase 대시보드에서 생성하세요.');
            }
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.error('user_settings upsert error:', error);
            }
          }
        }
      } catch {
        // 테이블 접근 실패 시 무시
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('user-data POST error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
