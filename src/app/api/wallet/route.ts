import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';

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

    const db = getSupabaseAdmin();

    const { data: wallets, error: walletError } = await db
      .from('user_wallets')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (walletError) {
      return NextResponse.json({ error: walletError.message || '지갑 조회 실패' }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      const { data: newWallet, error: createError } = await db
        .from('user_wallets')
        .insert({ user_id: userId, credits: {} })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: createError.message || '지갑 생성 실패' }, { status: 500 });
      }

      return NextResponse.json({ wallet: newWallet });
    }

    return NextResponse.json({ wallet: wallets[0] });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Wallet GET error:', error);
    }
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
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
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    return NextResponse.json({ error: '직접 크레딧 변경은 허용되지 않습니다.' }, { status: 403 });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Wallet PATCH error:', error);
    }
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}
