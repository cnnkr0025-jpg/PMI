/**
 * PickMyAI Discord 관제소 — 유틸리티 & 커맨드 핸들러
 *
 * 환경변수:
 *   DISCORD_APPLICATION_ID  — Discord 앱 ID
 *   DISCORD_PUBLIC_KEY      — Discord 앱 공개키 (서명 검증)
 *   DISCORD_BOT_TOKEN       — Discord 봇 토큰 (커맨드 등록용)
 *   DISCORD_WEBHOOK_URL     — 기존 웹훅 (알림 발송용)
 */

// ── Discord Interaction Types ──
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const;

export const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
} as const;

export const ButtonStyle = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
} as const;

// ── Ed25519 서명 검증 (Node.js native crypto) ──
export async function verifyDiscordRequest(
  publicKeyHex: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const crypto = await import('crypto');
    const msg = Buffer.from(timestamp + body);
    const sig = Buffer.from(signature, 'hex');
    const pubKey = Buffer.from(publicKeyHex, 'hex');

    // Ed25519 DER-encoded SPKI prefix
    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const derKey = Buffer.concat([derPrefix, pubKey]);

    return crypto.verify(
      null,
      msg,
      { key: derKey, format: 'der', type: 'spki' },
      sig,
    );
  } catch {
    return false;
  }
}

// ── Embed 빌더 ──
interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export function buildEmbed(opts: {
  title: string;
  description: string;
  color: number;
  fields?: EmbedField[];
  footer?: string;
}) {
  return {
    title: opts.title,
    description: opts.description,
    color: opts.color,
    fields: opts.fields?.map(f => ({ ...f, inline: f.inline ?? true })),
    timestamp: new Date().toISOString(),
    footer: { text: opts.footer ?? 'PickMyAI 관제소' },
  };
}

// ── 색상 상수 ──
const C = {
  GREEN: 0x2ecc71,
  RED: 0xe74c3c,
  YELLOW: 0xf1c40f,
  BLUE: 0x3498db,
  GRAY: 0x95a5a6,
};

// ── Supabase REST 헬퍼 ──
async function supa(path: string, opts?: RequestInit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경변수 없음');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return null;
}

// ══════════════════════════════════════════════════════════════
// 커맨드 핸들러
// ══════════════════════════════════════════════════════════════

/** /유저조회 email */
export async function handleUserInfo(email: string) {
  try {
    const rows = await supa(`users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
    if (!rows || rows.length === 0) {
      return {
        embeds: [buildEmbed({
          title: '❌ 유저를 찾을 수 없음',
          description: `\`${email}\`에 해당하는 유저가 없습니다.`,
          color: C.RED,
        })],
      };
    }
    const u = rows[0];
    return {
      embeds: [buildEmbed({
        title: '👤 유저 정보',
        description: `**${u.email}** 의 상세 정보`,
        color: C.BLUE,
        fields: [
          { name: '🆔 ID', value: `\`${u.id}\`` },
          { name: '📧 이메일', value: u.email || 'N/A' },
          { name: '💰 크레딧', value: String(u.credits ?? 0) },
          { name: '🎫 등급', value: u.role || u.plan || 'free' },
          { name: '📅 가입일', value: u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : 'N/A' },
          { name: '🕐 최근 접속', value: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('ko-KR') : 'N/A' },
        ],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`유저 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /유저삭제 email */
export async function handleUserDelete(email: string) {
  try {
    const rows = await supa(`users?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`);
    if (!rows || rows.length === 0) {
      return { embeds: [buildEmbed({ title: '❌ 유저 없음', description: `\`${email}\`를 찾을 수 없습니다.`, color: C.RED })] };
    }
    const u = rows[0];

    // Supabase Auth에서도 삭제 (service_role)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    }

    // users 테이블에서도 삭제
    await supa(`users?id=eq.${u.id}`, { method: 'DELETE' });

    return {
      embeds: [buildEmbed({
        title: '🗑️ 유저 삭제 완료',
        description: `**${u.email}** (${u.id}) 이(가) 삭제되었습니다.`,
        color: C.YELLOW,
        fields: [
          { name: '📧 이메일', value: u.email },
          { name: '🆔 ID', value: `\`${u.id}\`` },
        ],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`유저 삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /크레딧 email amount action(add/set) */
export async function handleCredit(email: string, amount: number, action: string) {
  try {
    const rows = await supa(`users?email=eq.${encodeURIComponent(email)}&select=id,email,credits&limit=1`);
    if (!rows || rows.length === 0) {
      return { embeds: [buildEmbed({ title: '❌ 유저 없음', description: `\`${email}\`를 찾을 수 없습니다.`, color: C.RED })] };
    }
    const u = rows[0];
    const oldCredits = u.credits ?? 0;
    const newCredits = action === 'set' ? amount : oldCredits + amount;

    await supa(`users?id=eq.${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ credits: newCredits }),
    });

    return {
      embeds: [buildEmbed({
        title: '💰 크레딧 변경 완료',
        description: `**${u.email}** 크레딧이 변경되었습니다.`,
        color: C.GREEN,
        fields: [
          { name: '📧 이메일', value: u.email },
          { name: '이전', value: String(oldCredits) },
          { name: '변경', value: action === 'set' ? `→ ${newCredits}` : `+${amount} → ${newCredits}` },
          { name: '현재', value: String(newCredits) },
        ],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`크레딧 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단 ip reason */
export async function handleBanIp(ip: string, reason: string, bannedBy?: string) {
  try {
    // 기존 차단 있으면 업데이트
    const existing = await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}&select=id&limit=1`);
    if (existing && existing.length > 0) {
      await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: true, reason, banned_by: bannedBy || 'discord' }),
      });
    } else {
      await supa('ip_bans', {
        method: 'POST',
        body: JSON.stringify({ ip, reason, banned_by: bannedBy || 'discord', is_active: true }),
      });
    }

    return {
      embeds: [buildEmbed({
        title: '🚫 IP 차단 완료',
        description: `**${ip}** 이(가) 영구 차단되었습니다.`,
        color: C.RED,
        fields: [
          { name: '🕵️ IP', value: `\`${ip}\`` },
          { name: '📝 사유', value: reason || '사유 없음' },
          { name: '👤 차단자', value: bannedBy || 'Discord 관제소' },
        ],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`IP 차단 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단해제 ip */
export async function handleUnbanIp(ip: string) {
  try {
    const existing = await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}&is_active=eq.true&select=id&limit=1`);
    if (!existing || existing.length === 0) {
      return { embeds: [buildEmbed({ title: '❓ 차단 기록 없음', description: `\`${ip}\`는 현재 차단되어 있지 않습니다.`, color: C.GRAY })] };
    }

    await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });

    return {
      embeds: [buildEmbed({
        title: '✅ IP 차단 해제',
        description: `**${ip}** 차단이 해제되었습니다.`,
        color: C.GREEN,
        fields: [{ name: '🕵️ IP', value: `\`${ip}\`` }],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`차단 해제 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단목록 */
export async function handleBanList() {
  try {
    const rows = await supa('ip_bans?is_active=eq.true&select=ip,reason,banned_by,created_at&order=created_at.desc&limit=25');
    if (!rows || rows.length === 0) {
      return { embeds: [buildEmbed({ title: '📋 차단 목록', description: '현재 차단된 IP가 없습니다.', color: C.GREEN })] };
    }

    const list = rows.map((r: { ip: string; reason?: string; created_at?: string }, i: number) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '';
      return `**${i + 1}.** \`${r.ip}\` — ${r.reason || '사유 없음'} (${date})`;
    }).join('\n');

    return {
      embeds: [buildEmbed({
        title: `🚫 차단 IP 목록 (${rows.length}개)`,
        description: list.slice(0, 1900),
        color: C.RED,
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`차단 목록 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /상태 */
export async function handleStatus() {
  try {
    const [userRows, banRows] = await Promise.all([
      supa('users?select=id&limit=1', { headers: { Prefer: 'count=exact', Range: '0-0' } as Record<string, string> }).catch(() => null),
      supa('ip_bans?is_active=eq.true&select=id&limit=1', { headers: { Prefer: 'count=exact', Range: '0-0' } as Record<string, string> }).catch(() => null),
    ]);

    return {
      embeds: [buildEmbed({
        title: '📊 PickMyAI 관제소 상태',
        description: '현재 시스템 상태 요약',
        color: C.BLUE,
        fields: [
          { name: '👥 총 유저', value: userRows ? `${Array.isArray(userRows) ? userRows.length : '?'}+` : 'N/A' },
          { name: '🚫 활성 차단', value: banRows ? `${Array.isArray(banRows) ? banRows.length : '?'}+` : '0' },
          { name: '🕐 조회 시각', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) },
          { name: '🌐 사이트', value: process.env.NEXT_PUBLIC_SITE_URL || 'https://pickmyai.store' },
        ],
      })],
    };
  } catch (err: unknown) {
    return errorResponse(`상태 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── 버튼 핸들러 (보안 알림 → 즉시 차단) ──
export async function handleButtonBanIp(customId: string) {
  // custom_id format: "ban_ip:<ip>"
  const ip = customId.replace('ban_ip:', '');
  if (!ip || ip === customId) {
    return errorResponse('IP를 파싱할 수 없습니다.');
  }
  return handleBanIp(ip, '보안 알림에서 즉시 차단', 'Discord 관제소 (버튼)');
}

// ── 에러 응답 헬퍼 ──
function errorResponse(msg: string) {
  return {
    embeds: [buildEmbed({
      title: '⚠️ 오류 발생',
      description: msg.slice(0, 1900),
      color: C.RED,
    })],
  };
}

// ── 슬래시 커맨드에서 옵션 값 추출 ──
export function getOption(options: Array<{ name: string; value: unknown }> | undefined, name: string): unknown {
  return options?.find(o => o.name === name)?.value;
}
