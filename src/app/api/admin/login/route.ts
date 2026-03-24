import { NextRequest, NextResponse } from 'next/server';
import { generateAdminToken, verifyAdminPassword, recordLoginAttempt, isIPLocked } from '@/lib/adminAuth';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_MAX_AGE_SECONDS,
  enforceTrustedOrigin,
  getAdminSecretPath,
  getClientIpFromRequest,
  getCookieSecurityOptions,
  getRequestAdminPath,
  setNoStoreHeaders,
} from '@/lib/serverSecurity';

export async function POST(request: NextRequest) {
  try {
    const originError = enforceTrustedOrigin(request);
    if (originError) {
      return originError;
    }

    const secretPath = getAdminSecretPath();
    const requestAdminPath = getRequestAdminPath(request);
    if (!secretPath || requestAdminPath !== secretPath) {
      return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    const clientIp = getClientIpFromRequest(request);

    if (!password) {
      return NextResponse.json({ error: '비밀번호를 입력해주세요.' }, { status: 400 });
    }

    // IP 잠금 상태 확인
    const lockStatus = isIPLocked(clientIp);
    if (lockStatus.locked) {
      const remainingTime = Math.ceil((lockStatus.lockedUntil! - Date.now()) / 1000 / 60);
      return NextResponse.json({
        error: `너무 많은 로그인 시도로 인해 잠시 후 다시 시도해주세요. (약 ${remainingTime}분 후)`,
        locked: true,
      }, { status: 429 });
    }

    // 비밀번호 검증
    const isValid = verifyAdminPassword(password);

    // 로그인 시도 기록
    const attemptResult = recordLoginAttempt(clientIp, isValid);

    if (!isValid) {
      if (!attemptResult.allowed) {
        const remainingTime = Math.ceil((attemptResult.lockedUntil! - Date.now()) / 1000 / 60);
        return NextResponse.json({
          error: `잠시 후 다시 시도해주세요. (약 ${remainingTime}분 후)`,
          locked: true,
        }, { status: 429 });
      }

      return NextResponse.json({
        error: '비밀번호가 올바르지 않습니다.',
      }, { status: 401 });
    }

    // 토큰 생성 및 쿠키 설정
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const token = await generateAdminToken(userAgent, requestAdminPath);

    const response = setNoStoreHeaders(NextResponse.json({ 
      success: true, 
      token,
      expiresIn: ADMIN_MAX_AGE_SECONDS * 1000
    }));

    response.cookies.set(ADMIN_COOKIE_NAME, token, getCookieSecurityOptions(ADMIN_MAX_AGE_SECONDS, 'strict'));

    return response;
  } catch (error: any) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
