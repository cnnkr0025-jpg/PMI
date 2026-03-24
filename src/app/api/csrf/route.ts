import { NextRequest, NextResponse } from 'next/server';
import { PHASE_EXPORT, PHASE_PRODUCTION_BUILD } from 'next/constants';

const isStaticExportPhase =
  process.env.NEXT_PHASE === PHASE_EXPORT ||
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

export async function GET(request: NextRequest) {
  if (isStaticExportPhase) {
    return NextResponse.json(
      { error: '정적 내보내기 환경에서는 CSRF 엔드포인트를 사용할 수 없습니다.' },
      {
        status: 501,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  const csrfTokenFromCookie = request.cookies.get('csrf-token')?.value;
  const csrfTokenFromMiddleware = request.headers.get('x-middleware-csrf-token');

  const csrfToken = csrfTokenFromCookie || csrfTokenFromMiddleware;

  if (!csrfToken) {
    return NextResponse.json(
      { error: 'CSRF 토큰을 찾을 수 없습니다.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  return NextResponse.json(
    { csrfToken },
    {
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
