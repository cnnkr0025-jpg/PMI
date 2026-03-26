import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter } from '@/lib/rateLimit';

const walletReadLimiter = new RateLimiter(30, 60 * 1000); // 분당 30회

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
  // 지갑/트랜잭션 API는 서버에서 DB를 직접 갱신하므로 service role이 필요합니다.
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. (Netlify 환경변수에 추가 필요)');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    const userId = sessionResult.userId;

    const rl = walletReadLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const db = getSupabaseAdmin();

    const { data: wallets, error: walletError } = await db
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (walletError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Wallet fetch error:', walletError.message);
      }
      return NextResponse.json({ error: '지갑 조회에 실패했습니다.' }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      const { data: newWallet, error: createError } = await db
        .from('user_wallets')
        .insert({ user_id: userId, credits: {} })
        .select()
        .single();

      if (createError) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Wallet create error:', createError.message);
        }
        return NextResponse.json({ error: '지갑 생성에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ wallet: newWallet });
    }

    return NextResponse.json({ wallet: wallets[0] });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Wallet GET error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    return NextResponse.json({ error: '직접 크레딧 변경은 허용되지 않습니다.' }, { status: 403 });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Wallet POST error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const userId = sessionResult.userId;
    const body = await request.json().catch(() => null);

    if (!body || typeof body.credits !== 'object' || Array.isArray(body.credits)) {
      return NextResponse.json({ error: '올바른 크레딧 데이터가 필요합니다.' }, { status: 400 });
    }

    const credits = body.credits as Record<string, number>;

    // 크레딧 값 검증 (0 이상의 정수만 허용)
    for (const [modelId, qty] of Object.entries(credits)) {
      if (typeof modelId !== 'string' || !Number.isFinite(qty) || qty < 0 || Math.floor(qty) !== qty) {
        return NextResponse.json({ error: '올바르지 않은 크레딧 값입니다.' }, { status: 400 });
      }
    }

    const db = getSupabaseAdmin();

    const { data: existing } = await db
      .from('user_wallets')
      .select('credits')
      .eq('user_id', userId)
      .single();

    const currentCredits = (existing?.credits as Record<string, number> | null) || {};

    // 병합: 서버값보다 클 때만 업데이트 (크레딧 감소 방지 - 감소는 결제/사용 경로로만)
    const merged: Record<string, number> = { ...currentCredits };
    for (const [modelId, qty] of Object.entries(credits)) {
      const current = merged[modelId] || 0;
      if (qty > current) {
        merged[modelId] = qty;
      }
    }

    // 0 이하 크레딧 제거
    for (const key of Object.keys(merged)) {
      if (merged[key] <= 0) delete merged[key];
    }

    const { error: upsertError } = await db
      .from('user_wallets')
      .upsert({ user_id: userId, credits: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (upsertError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Wallet upsert error:', upsertError.message);
      }
      return NextResponse.json({ error: '지갑 업데이트에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, credits: merged });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Wallet PATCH error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
