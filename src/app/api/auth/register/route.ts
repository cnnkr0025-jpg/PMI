import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';
import { RateLimiter } from '@/lib/rateLimit';
import {
  isValidEmail,
  isValidPassword,
  isValidName,
  sanitizeInput,
  createSecureToken,
  getSecureClientIp,
  safeParseJson,
  verifySecureCsrfToken,
} from '@/lib/secureAuth';

const registerRateLimiter = new RateLimiter(3, 60 * 60 * 1000); // 1시간에 3회

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (보안 강화된 IP 추출)
    const clientIp = getSecureClientIp(request);
    const rateLimitResult = registerRateLimiter.check(clientIp);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: '너무 많은 회원가입 시도입니다. 잠시 후 다시 시도해주세요.' },
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

    // CSRF 검증 (타이밍 공격 방지)
    if (!verifySecureCsrfToken(request)) {
      return NextResponse.json(
        { error: '요청이 유효하지 않습니다.' },
        { status: 403 }
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

    const { email, password, name } = parseResult.data;

    // 타입 및 형식 검증
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: '비밀번호는 8자 이상 128자 이하여야 합니다.' },
        { status: 400 }
      );
    }

    if (!isValidName(name)) {
      return NextResponse.json(
        { error: '이름은 2자 이상 50자 이하여야 합니다.' },
        { status: 400 }
      );
    }

    // 이름 sanitize
    const sanitizedName = sanitizeInput(name);

    // 회원가입 시도 (sanitized 입력 사용)
    const result = await AuthService.register(email as string, password as string, sanitizedName);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || '회원가입에 실패했습니다.' },
        { status: 400 }
      );
    }

    // 이메일 인증이 필요한 경우
    if (result.requiresEmailVerification) {
      return NextResponse.json({
        success: true,
        requiresEmailVerification: true,
        message: '이메일 인증이 필요합니다. 이메일을 확인해주세요.'
      });
    }

    // 이미 존재하는 계정인 경우 — 이메일 열거 방지를 위해 일반 성공 응답과 동일하게 처리
    if (result.autoLogin) {
      return NextResponse.json({
        success: true,
        requiresEmailVerification: true,
        message: '이메일 인증이 필요합니다. 이메일을 확인해주세요.',
      });
    }

    // 일반 회원가입 성공 - 로그인 필요
    return NextResponse.json({
      success: true,
      message: '회원가입이 완료되었습니다. 로그인해주세요.'
    });
  } catch (error: any) {
    // 프로덕션에서는 상세 에러 숨김
    if (process.env.NODE_ENV !== 'production') {
      console.error('Register error:', error);
    }
    return NextResponse.json(
      { error: '회원가입 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
