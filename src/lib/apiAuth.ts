import { NextRequest, NextResponse } from 'next/server';
import { supabase } from './supabase';
import { verifySecureToken } from './secureAuth';
import { SESSION_COOKIE_NAME } from './serverSecurity';

/**
 * API 요청 인증 미들웨어
 */
export async function verifyAuth(request: NextRequest): Promise<{ 
  authenticated: boolean; 
  userId?: string; 
  error?: string 
}> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, error: '인증 토큰이 없습니다.' };
    }

    const token = authHeader.substring(7);

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return { authenticated: false, error: '유효하지 않은 토큰입니다.' };
      }

      return { authenticated: true, userId: user.id };
    }

    return { authenticated: true };
  } catch (error) {
    return { authenticated: false, error: '인증 처리 중 오류가 발생했습니다.' };
  }
}

/**
 * 인증이 필요한 API 핸들러를 래핑
 */
export function withAuth(
  handler: (request: NextRequest, userId: string) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const auth = await verifyAuth(request);

    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    return handler(request, auth.userId!);
  };
}

/**
 * CSRF 토큰 검증 (타이밍 안전 비교)
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');
  const cookieToken = request.cookies.get('csrf-token')?.value;

  if (!csrfToken || !cookieToken) {
    return false;
  }

  // 고정 길이 패딩 후 상수 시간 비교 (타이밍 사이드채널 방지)
  const EXPECTED_LEN = 64;
  const cv = cookieToken.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
  const hv = csrfToken.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
  let mismatch = cookieToken.length !== EXPECTED_LEN ? 1 : 0;
  mismatch |= csrfToken.length !== EXPECTED_LEN ? 1 : 0;
  for (let i = 0; i < EXPECTED_LEN; i++) {
    mismatch |= cv.charCodeAt(i) ^ hv.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * 관리자 권한 확인
 */
export async function verifyAdmin(userId: string): Promise<boolean> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return false;
    }

    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * 세션 쿠키 검증 (HttpOnly)
 */
export async function verifySession(request: NextRequest): Promise<{ 
  authenticated: boolean; 
  userId?: string; 
  email?: string;
  name?: string;
  error?: string 
}> {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[verifySession] No session token found');
      }
      return { authenticated: false, error: '세션 토큰이 없습니다.' };
    }

    const verification = await verifySecureToken(sessionToken);
    if (!verification.valid || !verification.payload) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[verifySession] Token verification failed:', verification.error);
      }
      return {
        authenticated: false,
        error: verification.error || '세션 검증 실패',
      };
    }

    return {
      authenticated: true,
      userId: verification.payload.userId,
      email: verification.payload.email,
      name: verification.payload.name,
    };
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[verifySession] Unexpected error:', error);
    }
    return {
      authenticated: false,
      error: error?.message || '세션 검증 실패',
    };
  }
}
