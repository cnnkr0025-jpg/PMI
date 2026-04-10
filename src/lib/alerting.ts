/**
 * 보안 알림 시스템
 * - Discord / Slack 웹훅 연동
 * - 심각도별 라우팅
 * - Rate Limit으로 알림 폭주 방지
 *
 * 환경변수:
 *   DISCORD_WEBHOOK_URL  — Discord 웹훅 URL
 *   SLACK_WEBHOOK_URL    — Slack 웹훅 URL
 */

type AlertSeverity = 'info' | 'warn' | 'error' | 'critical';

interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  fields?: Record<string, string>;
}

// ── 알림 쿨다운 (같은 제목 5분 내 중복 방지) ──
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

function isThrottled(key: string): boolean {
  const last = alertCooldown.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  alertCooldown.set(key, Date.now());
  // 쿨다운 맵 크기 관리
  if (alertCooldown.size > 500) {
    const oldest = alertCooldown.keys().next().value;
    if (oldest !== undefined) alertCooldown.delete(oldest);
  }
  return false;
}

// ── 심각도 색상 ──
const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  info: 0x3498db,
  warn: 0xf39c12,
  error: 0xe74c3c,
  critical: 0x8b0000,
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '🚨',
  critical: '🔥',
};

/**
 * Discord 웹훅으로 알림 전송
 */
async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const fields = payload.fields
    ? Object.entries(payload.fields).map(([name, value]) => ({
        name,
        value: value.slice(0, 1024),
        inline: true,
      }))
    : [];

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `${SEVERITY_EMOJI[payload.severity]} ${payload.title}`,
          description: payload.message.slice(0, 2000),
          color: SEVERITY_COLORS[payload.severity],
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: 'PickMyAI Security' },
        }],
      }),
    });
  } catch {
    // 알림 실패는 무시 (무한루프 방지)
  }
}

/**
 * Slack 웹훅으로 알림 전송
 */
async function sendSlackAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;

  const fieldsText = payload.fields
    ? Object.entries(payload.fields)
        .map(([k, v]) => `*${k}:* ${v}`)
        .join('\n')
    : '';

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${SEVERITY_EMOJI[payload.severity]} ${payload.title}`,
            },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: payload.message.slice(0, 3000) },
          },
          ...(fieldsText
            ? [{
                type: 'section' as const,
                text: { type: 'mrkdwn' as const, text: fieldsText },
              }]
            : []),
        ],
      }),
    });
  } catch {
    // 알림 실패는 무시
  }
}

/**
 * 보안 알림 발송 (논블로킹)
 * - warn 이상만 외부 전송
 * - critical은 쿨다운 무시
 */
export function sendSecurityAlert(payload: AlertPayload): void {
  // info 레벨은 외부 전송 안 함
  if (payload.severity === 'info') return;

  // 쿨다운 체크 (critical 제외)
  if (payload.severity !== 'critical' && isThrottled(payload.title)) return;

  // 논블로킹으로 전송
  sendDiscordAlert(payload).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[alerting] Discord alert failed:', err);
    }
  });
  sendSlackAlert(payload).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[alerting] Slack alert failed:', err);
    }
  });
}

/**
 * 편의 함수들
 */
export function alertAuthFailure(ip: string, email: string, reason: string): void {
  sendSecurityAlert({
    title: '인증 실패 감지',
    message: `로그인 실패가 감지되었습니다.`,
    severity: 'warn',
    fields: { IP: ip, Email: email, Reason: reason },
  });
}

export function alertTokenReuse(userId: string, ip: string): void {
  sendSecurityAlert({
    title: '토큰 재사용 감지 (탈취 의심)',
    message: `Refresh Token 재사용이 감지되어 전체 세션이 무효화되었습니다.`,
    severity: 'critical',
    fields: { UserID: userId, IP: ip },
  });
}

export function alertHoneypotTriggered(ip: string, path: string): void {
  sendSecurityAlert({
    title: '허니팟 경로 접근',
    message: `공격 스캐닝이 감지되어 IP가 차단되었습니다.`,
    severity: 'error',
    fields: { IP: ip, Path: path },
  });
}

export function alertRateLimitBreach(ip: string, userId?: string): void {
  sendSecurityAlert({
    title: 'Rate Limit 반복 위반',
    message: `반복적인 Rate Limit 위반으로 차단되었습니다.`,
    severity: 'warn',
    fields: { IP: ip, ...(userId ? { UserID: userId } : {}) },
  });
}

export function alertSuspiciousActivity(description: string, details: Record<string, string>): void {
  sendSecurityAlert({
    title: '이상 행동 감지',
    message: description,
    severity: 'error',
    fields: details,
  });
}
