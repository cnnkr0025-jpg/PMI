import { NextRequest, NextResponse } from 'next/server';
import { createSecureToken } from '@/lib/secureAuth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { access_token, code, code_verifier } = body;

    let resolvedAccessToken = access_token;

    // code가 있으면 Supabase Auth API로 직접 token 교환 (서버사이드 PKCE 대체)
    if (!resolvedAccessToken && code) {
      if (process.env.NODE_ENV !== 'production') console.log('[social-session] Exchanging code for token...');
      const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=authorization_code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: typeof code_verifier === 'string' ? code_verifier : '',
        }),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        resolvedAccessToken = tokenData.access_token;
        if (process.env.NODE_ENV !== 'production') console.log('[social-session] Code exchange successful');
      } else {
        const errBody = await tokenRes.text();
        if (process.env.NODE_ENV !== 'production') console.error('[social-session] Code exchange failed:', tokenRes.status, errBody);
        return NextResponse.json(
          { error: '인증 코드 교환에 실패했습니다.' },
          { status: 401 }
        );
      }
    }

    if (!resolvedAccessToken) {
      return NextResponse.json(
        { error: '토큰이 필요합니다.' },
        { status: 400 }
      );
    }

    // Supabase Admin 클라이언트로 사용자 정보 확인
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(resolvedAccessToken);

    if (userError || !user) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[social-session] User verification failed:', userError?.message);
        console.error('[social-session] Access token present:', !!resolvedAccessToken);
      }
      return NextResponse.json(
        { error: '사용자 인증에 실패했습니다.' },
        { status: 401 }
      );
    }

    // users 테이블에서 사용자 정보 조회
    const { data: userData, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    let userName = user.user_metadata?.full_name || 
                   user.user_metadata?.name || 
                   user.email?.split('@')[0] || 
                   'User';

    // 사용자가 없으면 생성
    if (dbError || !userData) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[social-session] User not found in DB, creating...');
        if (dbError) console.log('[social-session] DB error:', dbError.message);
      }
      
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: user.id,
          email: user.email!,
          name: userName,
        })
        .select()
        .single();

      if (insertError) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[social-session] User insert error:', insertError.message);
          console.error('[social-session] Insert error code:', insertError.code);
        }
        
        // 이미 존재하는 경우 (race condition) 다시 조회
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (!existingUser) {
          // email로도 조회 시도
          const { data: existingByEmail } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', user.email!)
            .single();
          
          if (existingByEmail) {
            userName = existingByEmail.name;
            if (process.env.NODE_ENV !== 'production') console.log('[social-session] Found user by email');
          } else {
            if (process.env.NODE_ENV !== 'production') console.error('[social-session] User creation completely failed');
            // 실패해도 세션은 생성 (DB 없이도 로그인 가능)
          }
        } else {
          userName = existingUser.name;
        }
      } else if (newUser) {
        userName = newUser.name;
        if (process.env.NODE_ENV !== 'production') console.log('[social-session] User created successfully');
        
        // 지갑 생성
        const { error: walletError } = await supabaseAdmin
          .from('user_wallets')
          .insert({
            user_id: user.id,
            credits: {},
          });
        
        if (walletError) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[social-session] Wallet creation error:', walletError.message);
          }
        } else {
          if (process.env.NODE_ENV !== 'production') console.log('[social-session] Wallet created');
        }
      }
    } else {
      userName = userData.name;
      if (process.env.NODE_ENV !== 'production') console.log('[social-session] Existing user found');
      
      // 기존 사용자인데 지갑이 없으면 생성
      const { data: existingWallet } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      
      if (!existingWallet) {
        if (process.env.NODE_ENV !== 'production') console.log('[social-session] Creating missing wallet');
        await supabaseAdmin
          .from('user_wallets')
          .insert({ user_id: user.id, credits: {} });
      }
    }

    // 커스텀 JWT 세션 토큰 생성
    const sessionToken = await createSecureToken({
      userId: user.id,
      email: user.email!,
      name: userName,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: userName,
      }
    });

    // HttpOnly 세션 쿠키 설정
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7일
      path: '/',
    });

    return response;
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[social-session] Error:', error);
    return NextResponse.json(
      { error: '세션 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
