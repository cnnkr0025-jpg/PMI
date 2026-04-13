/**
 * PickMyAI TrapNet 8층 보안 알림 시스템
 *
 * TrapNet 계층별 색상:
 *   Critical (7층: 결제 변조, 토큰 재사용) → 빨강 (0xE74C3C)
 *   Error    (3~6층: 허니팟, UA, 헤더, 페이로드) → 노랑 (0xF1C40F)
 *   Info     (시스템 가동, 정상) → 초록 (0x2ECC71)
 *
 * 환경변수:
 *   DISCORD_WEBHOOK_URL  — Discord 웹훅 URL (필수)
 *   SLACK_WEBHOOK_URL    — Slack 웹훅 URL (선택)
 *   IPINFO_TOKEN         — IP 국가 조회용 (선택, 없으면 IP만 표시)
 */

type AlertSeverity = 'info' | 'warn' | 'error' | 'critical';

interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  fields?: Record<string, string>;
}

// ── TrapNet Rate Limit (Discord Rate Limit 30msg/60s 방어) ──
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 8_000; // 8초 (안전 마진)
const MAX_ALERTS_PER_MINUTE = 25;

let alertCountThisMinute = 0;
let currentMinute = Math.floor(Date.now() / 60000);

function isThrottled(key: string): boolean {
  const now = Date.now();
  const minute = Math.floor(now / 60000);

  if (minute !== currentMinute) {
    currentMinute = minute;
    alertCountThisMinute = 0;
  }

  if (alertCountThisMinute >= MAX_ALERTS_PER_MINUTE) return true;

  const last = alertCooldown.get(key);
  if (last && now - last < COOLDOWN_MS) return true;

  alertCooldown.set(key, now);
  alertCountThisMinute++;

  if (alertCooldown.size > 300) {
    const oldest = alertCooldown.keys().next().value;
    if (oldest !== undefined) alertCooldown.delete(oldest);
  }
  return false;
}

// ── TrapNet 8층 색상 매핑 (Embed) ──
const TRAP_COLORS = {
  critical: 0xE74C3C, // 7층: 결제 변조, 토큰 재사용
  error:    0xF1C40F, // 3~6층: 허니팟, UA, 헤더, 페이로드
  warn:     0xF39C12,
  info:     0x2ECC71, // 시스템 가동, 정상
} as const;

const TRAP_EMOJI = {
  critical: '🔥',
  error:    '🪤',
  warn:     '⚠️',
  info:     '🟢',
} as const;

/**
 * IP 국가 정보 조회 (ipapi.co 무료 API)
 */
async function getCountryFromIp(ip: string): Promise<string> {
  if (!ip || ip === 'unknown' || ip.startsWith('10.') || ip.startsWith('192.168.')) return 'Private / Local';
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return 'Unknown';
    const data = await res.json();
    return `${data.country_name || 'Unknown'} (${data.country_code || ''})`;
  } catch {
    return 'Unknown';
  }
}

/**
 * Discord Embed 알림 전송 (TrapNet 8층 스타일)
 */
async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  const FIELD_LABELS: Record<string, string> = {
    'IP':        '🕵️ 공격자 IP',
    'Layer':     '🏰 탐지 층',
    'Path':      '📍 요청 경로',
    'Pattern':   '🔍 공격 패턴',
    'UA':        '🌐 User-Agent',
    'Method':    '⚡ HTTP 메서드',
    'Origin':    '🌍 Origin',
    'Referer':   '🔗 Referer',
    'HitCount':  '🔢 누적 히트',
    'Status':    '🚦 차단 상태',
  };

  if (payload.fields) {
    for (const [name, value] of Object.entries(payload.fields)) {
      fields.push({
        name: FIELD_LABELS[name] ?? name,
        value: value.length > 900 ? value.slice(0, 897) + '...' : value,
        inline: true,
      });
    }
  }

  const color = payload.severity === 'critical' ? TRAP_COLORS.critical :
                payload.severity === 'error' ? TRAP_COLORS.error :
                payload.severity === 'warn' ? TRAP_COLORS.warn : TRAP_COLORS.info;

  const embed = {
    title: `${TRAP_EMOJI[payload.severity as keyof typeof TRAP_EMOJI] || '🛡️'} ${payload.title}`,
    description: payload.message.slice(0, 1900),
    color,
    fields: fields.length > 0 ? fields : undefined,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'PickMyAI TrapNet • 8층 방어 시스템',
      icon_url: 'https://pick-my-ai.com/favicon.ico',
    },
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Discord Alert] Failed:', err);
    }
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
              text: `${TRAP_EMOJI[payload.severity as keyof typeof TRAP_EMOJI] || '🛡️'} ${payload.title}`,
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
 * TrapNet 중앙 알림 발송 함수 (middleware, route.ts에서 바로 사용 가능)
 *
 * 사용 예시:
 * ```ts
 * await sendTrapNetAlert({
 *   title: "7층 결제 변조 탐지",
 *   severity: "critical",
 *   ip: "1.2.3.4",
 *   country: "대한민국",
 *   layer: 7,
 *   pattern: "amount mismatch (4200 → 100)",
 *   ua: "curl/8.5.0",
 *   path: "/api/payments/toss/confirm",
 *   message: "클라이언트가 orderToken을 변조했습니다."
 * });
 * ```
 */
export async function sendTrapNetAlert(params: {
  title: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  ip: string;
  country?: string;
  layer?: number;
  pattern?: string;
  ua?: string;
  path?: string;
  message?: string;
}): Promise<void> {
  const { title, severity, ip, country, layer, pattern, ua, path, message } = params;

  const countryInfo = country || (await getCountryFromIp(ip));

  const fields: Record<string, string> = {
    '🕵️ 공격자 IP': `${ip} (${countryInfo})`,
  };

  if (layer) fields['🏛️ TrapNet 층'] = `**${layer}층**`;
  if (pattern) fields['🛠️ 탐지 패턴'] = pattern;
  if (ua) fields['📡 User-Agent'] = ua.length > 60 ? ua.slice(0, 57) + '...' : ua;
  if (path) fields['📍 Path'] = path;

  const finalMessage = message || 'TrapNet이 공격자를 포착했습니다.';

  const payload: AlertPayload = {
    title: `[TrapNet ${layer || '?'}층] ${title}`,
    message: finalMessage,
    severity,
    fields,
  };

  // Rate Limit 체크
  if (severity !== 'critical' && isThrottled(`trapnet-${ip}-${title}`)) {
    return;
  }

  // Discord Embed 전송 (비동기)
  sendDiscordAlert(payload).catch(console.error);

  // Slack도 유지 (기존 사용자 호환)
  sendSlackAlert(payload).catch(console.error);
}

/**
 * 기존 sendSecurityAlert — TrapNet과 호환되도록 유지 (async로 변경)
 */
export async function sendSecurityAlert(payload: AlertPayload): Promise<void> {
  if (payload.severity === 'info') return;
  if (payload.severity !== 'critical' && isThrottled(payload.title)) return;

  await Promise.all([
    sendDiscordAlert(payload).catch((err) => {
      if (process.env.NODE_ENV !== 'production') console.error('[alerting] Discord failed:', err);
    }),
    sendSlackAlert(payload).catch((err) => {
      if (process.env.NODE_ENV !== 'production') console.error('[alerting] Slack failed:', err);
    }),
  ]);
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

export function alertHoneypotTriggered(ip: string, path: string, layer: number = 3): void {
  sendTrapNetAlert({
    title: '허니팟 트랩 발동',
    severity: 'error',
    ip,
    layer,
    pattern: path,
    message: `TrapNet ${layer}층이 공격자를 포착했습니다.`,
  });
}

export function alertRateLimitBreach(ip: string, userId?: string): void {
  sendTrapNetAlert({
    title: 'Rate Limit 반복 위반',
    severity: 'warn',
    ip,
    pattern: userId ? `User: ${userId}` : undefined,
    message: 'Rate Limit을 반복적으로 초과하여 자동 차단되었습니다.',
  });
}

export function alertSuspiciousActivity(description: string, details: Record<string, string>): void {
  sendTrapNetAlert({
    title: '이상 행동 감지',
    severity: 'error',
    ip: details.IP || details.ip || 'unknown',
    pattern: details.Pattern || details.pattern,
    message: description,
  });
}

/**
 * 7층 결제 변조 전용 알림
 */
export function alertPaymentTamper(ip: string, orderId: string, details: string): void {
  sendTrapNetAlert({
    title: '7층 결제 변조 탐지',
    severity: 'critical',
    ip,
    layer: 7,
    pattern: `Order: ${orderId}`,
    message: details,
  });
}

/**
 * 시스템 가동 알림 (초록)
 */
export function alertSystemReady(): void {
  sendTrapNetAlert({
    title: 'TrapNet 8층 가동',
    severity: 'info',
    ip: '127.0.0.1',
    message: 'PickMyAI TrapNet이 정상적으로 초기화되었습니다.\n모든 함정이 활성화되었습니다.',
  });
}

