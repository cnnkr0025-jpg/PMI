/**
 * Layer 11: Server-Issued Action Intent Token API
 *
 * POST: 토큰 발급 (JIT — 실행 직전)
 *
 * 클라이언트는 결제나 모델 호출 직전에 이 API를 호출하여 토큰을 받고,
 * 실제 요청 시 토큰을 그대로 전달한다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/apiAuth';
import { issueToken } from '@/lib/security/actionIntentToken';

export async function POST(request: NextRequest) {
  const session = await verifySession(request);
  if (!session.authenticated || !session.userId) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const route = typeof body.route === 'string' ? body.route : '';
  const method = typeof body.method === 'string' ? body.method : 'POST';
  const intentType = typeof body.intentType === 'string' ? body.intentType : '';

  if (!route || !intentType) {
    return NextResponse.json({ error: 'route and intentType are required' }, { status: 400 });
  }

  const sessionId = request.cookies.get('session')?.value || 'unknown';
  const boundParams = typeof body.boundParams === 'object' && body.boundParams !== null
    ? body.boundParams as Record<string, unknown>
    : {};

  const token = issueToken({
    userId: session.userId,
    sessionId,
    route,
    method,
    intentType,
    boundParams,
  });

  return NextResponse.json({
    tokenId: token.id,
    idempotencyKey: token.idempotencyKey,
    expiresAt: token.expiresAt,
  });
}
