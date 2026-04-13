import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';
import { createClient } from '@supabase/supabase-js';

// Admin 전용 Supabase 클라이언트 (Service Role)
const getAdminSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials not configured');
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
    }

    const { action, data } = await request.json();
    const adminClient = getAdminSupabase();

    switch (action) {
      case 'deleteUser': {
        const userId = typeof data?.userId === 'string' ? data.userId : '';
        if (!userId) {
          return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
        }
        
        // withdraw_user RPC: 거래 기록은 비식별화 보존(전자상거래법 5년)
        // 개인정보(settings, wallets, sessions)는 즉시 삭제
        const { data: rpcResult, error: rpcError } = await adminClient.rpc('withdraw_user', {
          p_user_id: userId,
        });

        if (rpcError) {
          console.error('withdraw_user RPC error:', rpcError);
          // RPC 실패 시 수동 삭제 폴백 (거래 기록 비식별화 우선)
          await adminClient.from('transactions').update({ user_id: null }).eq('user_id', userId);
          await adminClient.from('user_settings').delete().eq('user_id', userId);
          await adminClient.from('user_wallets').delete().eq('user_id', userId);
          await adminClient.from('chat_sessions').delete().eq('user_id', userId);
          await adminClient.from('users').delete().eq('id', userId);
        }
        
        const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
        if (authError) {
          console.error('Auth user deletion error:', authError);
        }
        
        return NextResponse.json({
          success: true,
          preservedTransactions: rpcResult?.preserved_transactions ?? 0,
        });
      }

      default:
        return NextResponse.json({ error: '허용되지 않은 작업입니다.' }, { status: 403 });
    }
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Database admin error:', error);
    }
    return NextResponse.json({ 
      error: '데이터베이스 작업 중 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}

// 테이블 스키마 조회 — 프로덕션에서 완전 차단
export async function GET(request: NextRequest) {
  // 보안 강화: 스키마 조회는 프로덕션에서 무조건 비활성화
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: '비활성화된 기능입니다.' }, { status: 403 });
  }

  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');

    if (!table || typeof table !== 'string') {
      return NextResponse.json({ error: 'table 파라미터가 필요합니다.' }, { status: 400 });
    }

    // 허용된 테이블 이름만 허용 (SQL Injection 방지)
    const ALLOWED_TABLES = new Set(['users', 'user_wallets', 'user_settings', 'chat_sessions', 'transactions', 'batch_requests']);
    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: '허용되지 않은 테이블입니다.' }, { status: 403 });
    }

    const adminClient = getAdminSupabase();
    
    const { data, error } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', table)
      .eq('table_schema', 'public');
    
    if (error) throw error;
    
    return NextResponse.json({ success: true, schema: data });
  } catch (error: any) {
    console.error('Schema query error:', error);
    return NextResponse.json({ 
      error: '스키마 조회 중 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}
