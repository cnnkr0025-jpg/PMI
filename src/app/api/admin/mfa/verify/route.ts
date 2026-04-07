/**
 * 관리자 MFA 코드 검증 API (로그인 2단계)
 * POST /api/admin/mfa/verify
 * Body: { pendingToken, code }
 */
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { verifyMfaCode } from '@/lib/mfa';
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
import { generateAdminToken } from '@/lib/adminAuth';

const SECRET_KEY = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || '';

function getPendingKey(): Uint8Array {
  if (!SECRET_KEY || SECRET_KEY.length < 32) throw new Error('JWT 키 미설정');
  return new TextEncoder().encode(`pending:${SECRET_KEY}`);
}

/** 비밀번호 검증 후 MFA 대기 중인 임시 토큰 생성 (3분 유효) */
async function generateMfaPendingToken(adminPath: string): Promise<string> {
  return new SignJWT({ role: 'mfa-pending', adminPath })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('3m')
    .sign(getPendingKey());
}

export async function POST(request: NextRequest) {
  const originError = enforceTrustedOrigin(request);
  if (originError) return originError;

  const secretPath = getAdminSecretPath();
  const requestAdminPath = getRequestAdminPath(request);
  if (!secretPath || requestAdminPath !== secretPath) {
    return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const pendingToken = typeof body?.pendingToken === 'string' ? body.pendingToken : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const clientIp = getClientIpFromRequest(request);

    if (!pendingToken || !code) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    // pending 토큰 검증
    let pendingPayload: { adminPath: string };
    try {
      const { payload } = await jwtVerify(pendingToken, getPendingKey(), { algorithms: ['HS256'] });
      if (payload.role !== 'mfa-pending') throw new Error('invalid role');
      pendingPayload = { adminPath: payload.adminPath as string };
    } catch {
      return NextResponse.json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' }, { status: 401 });
    }

    // MFA 코드 검증
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const mfaResult = await verifyMfaCode(code, 'admin', clientIp);

    if (!mfaResult.valid) {
      return NextResponse.json({ error: mfaResult.error }, { status: 401 });
    }

    // 최종 관리자 토큰 발급
    const token = await generateAdminToken(userAgent, pendingPayload.adminPath);

    const response = setNoStoreHeaders(
      NextResponse.json({
        success: true,
        token,
        method: mfaResult.method,
        expiresIn: ADMIN_MAX_AGE_SECONDS * 1000,
      })
    );

    response.cookies.set(ADMIN_COOKIE_NAME, token, getCookieSecurityOptions(ADMIN_MAX_AGE_SECONDS, 'strict'));
    return response;
  } catch {
    return NextResponse.json({ error: 'MFA 검증 처리 실패' }, { status: 500 });
  }
}
