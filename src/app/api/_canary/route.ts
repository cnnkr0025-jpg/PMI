/**
 * Layer 19: Wasm Canary Artifact 수신 엔드포인트
 *
 * 정상 클라이언트는 이 엔드포인트를 절대 호출하지 않음.
 * 리버스 엔지니어가 .wasm 디코이의 함정 함수를 호출하면 여기로 도달.
 *
 * 점수: exploit_intent +100 (hard signal)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCanaryAccess } from '@/lib/security/wasmCanary';
import { reportLayer, evaluate } from '@/lib/security/riskEngine';
import type { RiskContext } from '@/lib/security/riskTypes';
import { securityAudit, generateCorrelationId } from '@/lib/auditLog';
import { sendSecurityAlert } from '@/lib/alerting';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // 파싱 실패도 의심 접근
  }

  const canaryId = typeof body.canaryId === 'string' ? body.canaryId : undefined;
  const artifact = typeof body.artifact === 'string' ? body.artifact : undefined;

  const result = verifyCanaryAccess({ canaryId, artifact, ip });

  if (result.isReverseEngineering) {
    const ctx: RiskContext = {
      ip,
      userAgent: ua,
      pathname: '/api/_canary',
      method: 'POST',
      isAuthenticated: false,
    };

    reportLayer(ctx, 19, 'WASM_CANARY_TRIGGERED', 100, 'account_risk', 'exploit_intent', 'hard', {
      detail: result.detail,
    });

    const evalResult = evaluate(ctx);
    const correlationId = generateCorrelationId();

    securityAudit({
      correlation_id: correlationId,
      decision: evalResult.decision,
      reason: `WASM_CANARY: ${result.detail}`,
      score_total: evalResult.totalScore,
      score_breakdown: { 'L19:WASM_CANARY_TRIGGERED': 100 },
      scope_snapshot: evalResult.scopeScores,
      triggered_layers: [19],
      ip,
      user_agent: ua,
      request_method: 'POST',
      request_path: '/api/_canary',
    });

    sendSecurityAlert({
      title: 'Layer 19: Wasm Canary Triggered',
      message: `리버스 엔지니어링 시도 탐지: ${result.detail}`,
      severity: 'critical',
      fields: { IP: ip, Detail: result.detail, UA: ua.slice(0, 100) },
    });
  }

  // 항상 무해한 응답 반환 (실제 기능이 없는 것처럼)
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
