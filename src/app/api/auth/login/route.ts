import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';
import { RateLimiter } from '@/lib/rateLimit';
import {
  isValidEmail,
  isValidPassword,
  createSecureToken,
  getSecureClientIp,
  safeParseJson,
} from '@/lib/secureAuth';
import { alertAuthFailure } from '@/lib/alerting';
import { securityLogger } from '@/lib/securityLogger';

const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000); // 15분에 5회

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (보안 강화된 IP 추출)
    const clientIp = getSecureClientIp(request);
    const rateLimitResult = loginRateLimiter.check(clientIp);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: '너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
          }
        }
      );
    }

    // 안전한 JSON 파싱
    const parseResult = await safeParseJson(request);
    if (!parseResult.success || !parseResult.data) {
      return NextResponse.json(
        { error: parseResult.error || '잘못된 요청입니다.' },
        { status: 400 }
      );
    }

    const { email, password } = parseResult.data;

    // 타입 및 형식 검증
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: '비밀번호를 확인해주세요.' },
        { status: 400 }
      );
    }

    // 로그인 시도
    const result = await AuthService.login(email, password);

    if (!result.success || !result.user) {
      alertAuthFailure(clientIp, email as string, result.error || 'unknown');
      securityLogger.logAuthFailure(email as string, clientIp, result.error || 'unknown');
      return NextResponse.json(
        { error: result.error || '로그인에 실패했습니다.' },
        { status: 401 }
      );
    }

    // JWT 세션 토큰 생성 (보안 강화)
    const sessionToken = await createSecureToken({
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
    });

    securityLogger.logAuthSuccess(result.user.id, clientIp, request.headers.get('user-agent') || undefined);

    // HttpOnly 쿠키 설정
    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      }
    });

    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7일
      path: '/',
    });

    return response;
  } catch (error: any) {
    // 프로덕션에서는 상세 에러 숨김
    if (process.env.NODE_ENV !== 'production') {
      console.error('Login error:', error);
    }
    // 일반적인 에러 메시지 (정보 노출 방지)
    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
