/**
 * Layer 16: Step-up Challenge API
 *
 * GET: 챌린지 발급
 * POST: 챌린지 검증
 */

import { NextRequest, NextResponse } from 'next/server';
import { issueChallenge, verifyChallenge } from '@/lib/security/challengeOrchestrator';
import { recordChallengeFailure, applyChallengeSuccess, reportLayer, evaluate } from '@/lib/security/riskEngine';
import type { RiskContext } from '@/lib/security/riskTypes';
import { sendSecurityAlert } from '@/lib/alerting';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * GET /api/security/challenge — 챌린지 발급
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const sessionId = request.cookies.get('session')?.value;

  const challenge = issueChallenge({
    ip,
    sessionId,
    type: 'pow',
  });

  return NextResponse.json({
    challengeId: challenge.id,
    type: challenge.type,
    puzzle: challenge.puzzle,
    difficulty: challenge.difficulty,
    expiresAt: challenge.expiresAt,
  });
}

/**
 * POST /api/security/challenge — 챌린지 검증
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';
  const sessionId = request.cookies.get('session')?.value;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const solution = typeof body.solution === 'string' ? body.solution : '';

  if (!challengeId || !solution) {
    return NextResponse.json({ error: 'challengeId and solution required' }, { status: 400 });
  }

  const result = verifyChallenge({ challengeId, solution, ip });

  const ctx: RiskContext = {
    ip,
    userAgent: ua,
    sessionId,
    pathname: '/api/security/challenge',
    method: 'POST',
    isAuthenticated: !!sessionId,
  };

  if (result.valid) {
    // 성공 → session_risk -20
    applyChallengeSuccess(ctx);
    return NextResponse.json({ valid: true, message: 'Challenge passed' });
  }

  // 실패 → +30
  recordChallengeFailure(ctx);
  reportLayer(ctx, 16, 'CHALLENGE_FAILED', 30, 'session_risk', 'automation', 'medium', {
    detail: `Challenge failed: ${result.reason}`,
  });

  // Layer 16 Discord 알림 — Challenge 실패는 자동화 의심
  sendSecurityAlert({
    title: '🛡️ 16층 Challenge 실패',
    severity: 'error',
    message: `PoW/Captcha 챌린지 실패: ${result.reason}`,
    fields: {
      IP: ip,
      Layer: '16층 — Step-up Challenge',
      Reason: result.reason,
      SessionID: sessionId || 'none',
      UA: ua.slice(0, 100),
    },
  });

  return NextResponse.json({
    valid: false,
    reason: result.reason,
  }, { status: 403 });
}
