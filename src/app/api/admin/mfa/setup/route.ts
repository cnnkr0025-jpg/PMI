/**
 * 관리자 MFA 설정 API
 * GET  /api/admin/mfa/setup — 현재 MFA 상태 조회
 * POST /api/admin/mfa/setup — TOTP 시크릿 생성 (QR URI 반환)
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';
import { getMfaState, initTotpSetup, confirmTotpSetup, disableMfa, regenerateRecoveryCodes } from '@/lib/mfa';
import { getClientIpFromRequest, setNoStoreHeaders } from '@/lib/serverSecurity';

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const ok = await isAuthorizedAdminRequest(request);
  if (!ok) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  try {
    const state = await getMfaState();
    const res = NextResponse.json({
      totpEnabled: state?.totp_enabled ?? false,
      setupCompleted: !!state?.setup_completed_at,
      recoveryCodesRemaining: state?.recovery_codes_hashed?.length ?? 0,
      webauthnCount: state?.webauthn_credentials?.length ?? 0,
    });
    return setNoStoreHeaders(res);
  } catch {
    return NextResponse.json({ error: 'MFA 상태 조회 실패' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : 'init';

    if (action === 'init') {
      // TOTP 시크릿 생성 — QR URI 반환 (시크릿 자체는 클라이언트에 한 번만 노출)
      const { secret, uri } = await initTotpSetup();
      return setNoStoreHeaders(
        NextResponse.json({ secret, uri, message: 'QR코드를 스캔하고 코드를 확인해주세요.' })
      );
    }

    if (action === 'confirm') {
      // TOTP 설정 확인 (코드 검증 후 Recovery codes 반환)
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!code) return NextResponse.json({ error: '코드를 입력해주세요.' }, { status: 400 });

      const result = await confirmTotpSetup(code);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

      return setNoStoreHeaders(
        NextResponse.json({
          success: true,
          recoveryCodes: result.recoveryCodes,
          message: 'MFA가 활성화되었습니다. Recovery codes를 안전한 곳에 보관하세요.',
        })
      );
    }

    if (action === 'disable') {
      await disableMfa();
      return setNoStoreHeaders(NextResponse.json({ success: true, message: 'MFA가 비활성화되었습니다.' }));
    }

    if (action === 'regenerate-codes') {
      const codes = await regenerateRecoveryCodes();
      return setNoStoreHeaders(
        NextResponse.json({ success: true, recoveryCodes: codes, message: 'Recovery codes가 재생성되었습니다.' })
      );
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'MFA 설정 처리 실패' }, { status: 500 });
  }
}
