/**
 * Layer 9: 디코이 카나리 엔드포인트
 *
 * /api/admin/force_charge, /api/internal/pmc_override 등 가짜 경로.
 * 인증 컨텍스트에서 접근 시 강한 exploit_intent (+90).
 * Shadow 직행 가능.
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportLayer, evaluate } from '@/lib/security/riskEngine';
import type { RiskContext } from '@/lib/security/riskTypes';
import { securityAudit, generateCorrelationId } from '@/lib/auditLog';
import { enterShadow } from '@/lib/security/shadowContext';
import { sendSecurityAlert } from '@/lib/alerting';
import crypto from 'crypto';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function GET(request: NextRequest) { return handleDecoy(request); }
export async function POST(request: NextRequest) { return handleDecoy(request); }
export async function PUT(request: NextRequest) { return handleDecoy(request); }
export async function DELETE(request: NextRequest) { return handleDecoy(request); }
export async function PATCH(request: NextRequest) { return handleDecoy(request); }

async function handleDecoy(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';
  const pathname = request.nextUrl.pathname;
  const sessionId = request.cookies.get('session')?.value ? 'authenticated' : 'anonymous';

  const ctx: RiskContext = {
    ip,
    userAgent: ua,
    pathname,
    method: request.method,
    isAuthenticated: sessionId === 'authenticated',
    sessionId,
  };

  // Layer 9: exploit_intent +90 (hard signal)
  reportLayer(ctx, 9, 'DECOY_ADMIN_ENDPOINT', 90, 'account_risk', 'exploit_intent', 'hard', {
    detail: `Decoy endpoint accessed: ${pathname}`,
  });

  const result = evaluate(ctx);
  const correlationId = generateCorrelationId();

  securityAudit({
    correlation_id: correlationId,
    decision: result.decision,
    reason: result.decisionReason,
    score_total: result.totalScore,
    score_breakdown: Object.fromEntries(
      result.activeSignals.map(s => [`L${s.layer}:${s.type}`, s.score]),
    ),
    scope_snapshot: result.scopeScores,
    triggered_layers: result.activeSignals.map(s => s.layer),
    ip,
    user_agent: ua,
    request_method: request.method,
    request_path: pathname,
    shadow_reason: result.decision === 'shadow' ? 'Decoy admin endpoint access' : undefined,
  });

  // Layer 9 Discord 알림 — 디코이 접근은 항상 공격자 의도로 판단
  sendSecurityAlert({
    title: result.decision === 'shadow' ? '🔥 9층 디코이 → Shadow 진입' : '🪤 9층 디코이 트랩 발동',
    severity: result.decision === 'shadow' ? 'critical' : 'error',
    message: `허니팟(디코이) 엔드포인트 ${pathname}에 접근했습니다. ` +
             `결정: ${result.decision}, 점수: ${result.totalScore}`,
    fields: {
      IP: ip,
      Layer: '9층 — 디코이 카나리',
      Path: pathname.slice(0, 100),
      Decision: result.decision,
      Score: String(result.totalScore),
      UA: ua.slice(0, 100),
    },
  });

  // Shadow 진입 대상이면 가짜 성공 응답
  if (result.decision === 'shadow' && ctx.userId) {
    enterShadow({
      userId: ctx.userId,
      sessionId,
      entryReasons: ['DECOY_ADMIN_ENDPOINT'],
      entryScore: result.totalScore,
      auditCorrelationId: correlationId,
    });
  }

  // 가짜 성공 응답 (해커가 성공했다고 착각하게)
  const lp = pathname.toLowerCase();

  if (lp.includes('force_charge') || lp.includes('pmc_override')) {
    return NextResponse.json({
      success: true,
      message: 'Credits applied successfully',
      balance: 99999 + Math.floor(Math.random() * 50000),
      transactionId: crypto.randomUUID(),
    }, { status: 200 });
  }

  if (lp.includes('admin') || lp.includes('internal')) {
    return NextResponse.json({
      error: 'Session expired',
      loginUrl: '/api/admin/login',
      hint: 'Use X-Admin-Token header',
      _debug: { server: 'pickmyai-prod-1', version: '2.1.0-rc3' },
    }, { status: 401 });
  }

  return NextResponse.json({
    status: 'ok',
    data: null,
    _trace: crypto.randomUUID(),
  }, { status: 200 });
}
