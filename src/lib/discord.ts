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
  thumbnail?: string;
}) {
  return {
    title: opts.title,
    description: opts.description,
    color: opts.color,
    fields: opts.fields?.map(f => ({ ...f, inline: f.inline ?? true })),
    timestamp: new Date().toISOString(),
    footer: { text: opts.footer ?? '🛡️ PickMyAI 관제소' },
    ...(opts.thumbnail ? { thumbnail: { url: opts.thumbnail } } : {}),
  };
}

// ── 색상 상수 ──
const C = {
  GREEN: 0x2ecc71,
  RED: 0xe74c3c,
  YELLOW: 0xf1c40f,
  BLUE: 0x3498db,
  PURPLE: 0x9b59b6,
  ORANGE: 0xe67e22,
  GRAY: 0x95a5a6,
  CYAN: 0x1abc9c,
};

// ── 모델 ID → 표시명 매핑 ──
const MODEL_NAMES: Record<string, string> = {
  gpt4o: 'GPT-4o', gpt41: 'GPT-4.1', gpt41mini: 'GPT-4.1 Mini', gpt41nano: 'GPT-4.1 Nano',
  gpt5: 'GPT-5', gpt51: 'GPT-5.1', gpt52: 'GPT-5.2', gpt53instant: 'GPT-5.3 Instant', gpt54: 'GPT-5.4',
  gpt5codex: 'GPT-5 Codex', gpt51codex: 'GPT-5.1 Codex', gpt51codexmax: 'GPT-5.1 Codex Max', gpt52codex: 'GPT-5.2 Codex',
  o3: 'o3', o3mini: 'o3-mini', o4mini: 'o4-mini',
  haiku45: 'Claude Haiku 4.5', sonnet45: 'Claude Sonnet 4.5', sonnet46: 'Claude Sonnet 4.6',
  opus45: 'Claude Opus 4.5', opus46: 'Claude Opus 4.6',
  sonar: 'Perplexity Sonar', sonarPro: 'Sonar Pro', deepResearch: 'Deep Research',
  gemini3: 'Gemini 3.0 Flash', gemini3pro: 'Gemini 3.0 Pro',
  grok3mini: 'Grok 3 Mini', grok3: 'Grok 3', grok4fastNR: 'Grok 4 Fast', grok4fastR: 'Grok 4 Fast (R)',
  grok41fastNR: 'Grok 4.1 Fast', grok41fastR: 'Grok 4.1 Fast (R)', grok40709: 'Grok 4 (0709)',
  grokCodeFast1: 'Grok Code Fast 1', grokImagine: 'Grok Imagine', grok2image: 'Grok 2 Image',
  gptimage1: 'GPT-Image-1', dalle3: 'DALL-E 3',
  // 48h 배치 모델
  gpt5_48h: 'GPT-5 · 48h', gpt51_48h: 'GPT-5.1 · 48h', gpt52_48h: 'GPT-5.2 · 48h',
  gpt53instant_48h: 'GPT-5.3 · 48h', gpt54_48h: 'GPT-5.4 · 48h',
  gpt4o_48h: 'GPT-4o · 48h', gpt41_48h: 'GPT-4.1 · 48h',
  o3_48h: 'o3 · 48h', o4mini_48h: 'o4-mini · 48h',
  haiku45_48h: 'Haiku 4.5 · 48h', sonnet45_48h: 'Sonnet 4.5 · 48h', sonnet46_48h: 'Sonnet 4.6 · 48h',
  opus45_48h: 'Opus 4.5 · 48h', opus46_48h: 'Opus 4.6 · 48h',
};

const PLAN_LABELS: Record<string, string> = {
  free: '🆓 Free', plus: '💎 Plus', pro: '🔥 Pro', max: '👑 Max',
};

function modelName(id: string): string {
  return MODEL_NAMES[id] || id;
}

function sep(): string {
  return '\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
}

function kstNow(): string {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

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
// 유저/지갑 조회 헬퍼
// ══════════════════════════════════════════════════════════════

async function findUser(email: string) {
  const rows = await supa(`users?email=eq.${encodeURIComponent(email)}&select=id,email,name,created_at&limit=1`);
  if (!rows || rows.length === 0) return null;
  return rows[0] as { id: string; email: string; name?: string; created_at?: string };
}

async function getUserWallet(userId: string): Promise<Record<string, number>> {
  const rows = await supa(`user_wallets?user_id=eq.${userId}&select=credits&limit=1`);
  if (!rows || rows.length === 0) return {};
  return (rows[0].credits as Record<string, number>) || {};
}

async function getUserPlan(userId: string): Promise<string> {
  const rows = await supa(`user_settings?user_id=eq.${userId}&select=data&limit=1`);
  if (!rows || rows.length === 0) return 'free';
  return (rows[0].data as Record<string, unknown>)?.userPlan as string || 'free';
}

function formatCredits(credits: Record<string, number>): string {
  const entries = Object.entries(credits).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '*크레딧 없음*';
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const lines = entries.map(([id, v]) => `> **${modelName(id)}** — \`${v}회\``);
  return `📊 **총 ${total}회** (${entries.length}종)\n${lines.join('\n')}`;
}

// ══════════════════════════════════════════════════════════════
// 커맨드 핸들러
// ══════════════════════════════════════════════════════════════

/** /유저조회 email */
export async function handleUserInfo(email: string) {
  try {
    const u = await findUser(email);
    if (!u) {
      return { embeds: [buildEmbed({ title: '❌ 유저를 찾을 수 없음', description: `\`${email}\` 에 해당하는 유저가 없습니다.`, color: C.RED })] };
    }

    const [credits, plan] = await Promise.all([getUserWallet(u.id), getUserPlan(u.id)]);
    const created = u.created_at ? new Date(u.created_at).toLocaleDateString('ko-KR') : 'N/A';

    const desc = [
      `## 👤 ${u.name || u.email}`,
      '',
      `� **이메일**  ${u.email}`,
      `🆔 **ID**  \`${u.id}\``,
      `🎫 **플랜**  ${PLAN_LABELS[plan] || plan}`,
      `📅 **가입일**  ${created}`,
      sep(),
      `## 💰 크레딧 현황`,
      '',
      formatCredits(credits),
    ].join('\n');

    return { embeds: [buildEmbed({ title: '👤 유저 상세 정보', description: desc, color: C.BLUE })] };
  } catch (err: unknown) {
    return errorResponse(`유저 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /유저삭제 email */
export async function handleUserDelete(email: string) {
  try {
    const u = await findUser(email);
    if (!u) {
      return { embeds: [buildEmbed({ title: '❌ 유저 없음', description: `\`${email}\` 를 찾을 수 없습니다.`, color: C.RED })] };
    }

    const credits = await getUserWallet(u.id);

    // Supabase Auth 삭제
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    }

    // 관련 데이터 삭제
    await Promise.allSettled([
      supa(`user_wallets?user_id=eq.${u.id}`, { method: 'DELETE' }),
      supa(`user_settings?user_id=eq.${u.id}`, { method: 'DELETE' }),
      supa(`users?id=eq.${u.id}`, { method: 'DELETE' }),
    ]);

    const totalCredits = Object.values(credits).reduce((s, v) => s + v, 0);

    const desc = [
      '## 🗑️ 유저가 완전히 삭제되었습니다',
      '',
      `📧 **이메일**  ${u.email}`,
      `🆔 **ID**  \`${u.id}\``,
      `💰 **잔여 크레딧**  ${totalCredits}회 (소멸)`,
      '',
      '> Auth + users + wallet + settings 전부 삭제됨',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '🗑️ 유저 삭제 완료', description: desc, color: C.YELLOW })] };
  } catch (err: unknown) {
    return errorResponse(`유저 삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /크레딧 email model amount action(add/set) */
export async function handleCredit(email: string, model: string, amount: number, action: string) {
  try {
    const u = await findUser(email);
    if (!u) {
      return { embeds: [buildEmbed({ title: '❌ 유저 없음', description: `\`${email}\` 를 찾을 수 없습니다.`, color: C.RED })] };
    }

    // 모델 ID 검증
    if (!MODEL_NAMES[model]) {
      const available = Object.entries(MODEL_NAMES)
        .filter(([id]) => !id.includes('_48h'))
        .map(([id, name]) => `\`${id}\` → ${name}`)
        .join('\n> ');
      return { embeds: [buildEmbed({
        title: '❌ 알 수 없는 모델 ID',
        description: `\`${model}\` 은(는) 유효하지 않은 모델 ID 입니다.\n\n**사용 가능한 모델:**\n> ${available}`,
        color: C.RED,
      })] };
    }

    const credits = await getUserWallet(u.id);
    const oldVal = credits[model] || 0;
    const newVal = action === 'set' ? amount : oldVal + amount;
    credits[model] = Math.max(0, newVal);

    // 0인 키 제거
    if (credits[model] === 0) delete credits[model];

    await supa(`user_wallets?user_id=eq.${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ credits, updated_at: new Date().toISOString() }),
    });

    const changeIcon = action === 'set' ? '🔄' : (amount >= 0 ? '➕' : '➖');
    const changeText = action === 'set'
      ? `${oldVal}회 → **${credits[model] || 0}회** (설정)`
      : `${oldVal}회 → **${credits[model] || 0}회** (${amount >= 0 ? '+' : ''}${amount})`;

    const desc = [
      `## ${changeIcon} 크레딧 변경 완료`,
      '',
      `� **유저**  ${u.email}`,
      `🤖 **모델**  ${modelName(model)} (\`${model}\`)`,
      '',
      `> 📊 **변경 내역**`,
      `> ${changeText}`,
      sep(),
      `## 💰 변경 후 전체 크레딧`,
      '',
      formatCredits(credits),
      '',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '💰 크레딧 변경', description: desc, color: C.GREEN })] };
  } catch (err: unknown) {
    return errorResponse(`크레딧 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단 ip reason */
export async function handleBanIp(ip: string, reason: string, bannedBy?: string) {
  try {
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

    const desc = [
      '## 🚫 IP가 영구 차단되었습니다',
      '',
      `🕵️ **IP**  \`${ip}\``,
      `📝 **사유**  ${reason || '사유 없음'}`,
      `👤 **차단자**  ${bannedBy || 'Discord 관제소'}`,
      '',
      '> ⏱️ 영구 차단 — middleware 캐시 갱신까지 최대 5분 소요',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '🚫 IP 차단 완료', description: desc, color: C.RED })] };
  } catch (err: unknown) {
    return errorResponse(`IP 차단 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단해제 ip */
export async function handleUnbanIp(ip: string) {
  try {
    const existing = await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}&is_active=eq.true&select=id,reason,created_at&limit=1`);
    if (!existing || existing.length === 0) {
      return { embeds: [buildEmbed({ title: '❓ 차단 기록 없음', description: `\`${ip}\` 는 현재 차단되어 있지 않습니다.`, color: C.GRAY })] };
    }

    const ban = existing[0];
    await supa(`ip_bans?ip=eq.${encodeURIComponent(ip)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });

    const desc = [
      '## ✅ IP 차단이 해제되었습니다',
      '',
      `🕵️ **IP**  \`${ip}\``,
      `📝 **원래 사유**  ${ban.reason || '없음'}`,
      `📅 **차단일**  ${ban.created_at ? new Date(ban.created_at).toLocaleDateString('ko-KR') : 'N/A'}`,
      '',
      '> ⏱️ middleware 캐시 갱신까지 최대 5분 소요',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '✅ IP 차단 해제', description: desc, color: C.GREEN })] };
  } catch (err: unknown) {
    return errorResponse(`차단 해제 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /차단목록 */
export async function handleBanList() {
  try {
    const rows = await supa('ip_bans?is_active=eq.true&select=ip,reason,banned_by,created_at&order=created_at.desc&limit=25');
    if (!rows || rows.length === 0) {
      return { embeds: [buildEmbed({ title: '📋 차단 목록', description: '🎉 현재 차단된 IP가 없습니다!', color: C.GREEN })] };
    }

    const lines = rows.map((r: { ip: string; reason?: string; banned_by?: string; created_at?: string }, i: number) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '';
      const by = r.banned_by || 'system';
      return `**${i + 1}.** \`${r.ip}\`\n> 📝 ${r.reason || '사유 없음'} · 👤 ${by} · 📅 ${date}`;
    }).join('\n\n');

    const desc = [
      `## 🚫 현재 차단 중인 IP: ${rows.length}개`,
      '',
      lines,
      '',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '🚫 IP 차단 목록', description: desc.slice(0, 3900), color: C.RED })] };
  } catch (err: unknown) {
    return errorResponse(`차단 목록 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /플랜변경 email plan */
export async function handlePlanChange(email: string, plan: string) {
  try {
    const u = await findUser(email);
    if (!u) {
      return { embeds: [buildEmbed({ title: '❌ 유저 없음', description: `\`${email}\` 를 찾을 수 없습니다.`, color: C.RED })] };
    }

    const validPlans = ['free', 'plus', 'pro', 'max'];
    if (!validPlans.includes(plan)) {
      return { embeds: [buildEmbed({ title: '❌ 유효하지 않은 플랜', description: `사용 가능: \`${validPlans.join('\`, \`')}\``, color: C.RED })] };
    }

    const oldPlan = await getUserPlan(u.id);

    // 기존 settings 읽기 & 머지
    const settingsRows = await supa(`user_settings?user_id=eq.${u.id}&select=data&limit=1`);
    const currentData = (settingsRows?.[0]?.data as Record<string, unknown>) || {};
    const updatedData = { ...currentData, userPlan: plan };

    await supa(`user_settings?user_id=eq.${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: updatedData, updated_at: new Date().toISOString() }),
    }).catch(async () => {
      // 없으면 insert
      await supa('user_settings', {
        method: 'POST',
        body: JSON.stringify({ user_id: u.id, data: updatedData, updated_at: new Date().toISOString() }),
      });
    });

    const desc = [
      '## 🎫 플랜이 변경되었습니다',
      '',
      `👤 **유저**  ${u.email}`,
      '',
      `> ${PLAN_LABELS[oldPlan] || oldPlan}  →  **${PLAN_LABELS[plan] || plan}**`,
      '',
      `> 🕐 ${kstNow()}`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '🎫 플랜 변경 완료', description: desc, color: C.PURPLE })] };
  } catch (err: unknown) {
    return errorResponse(`플랜 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /상태 */
export async function handleStatus() {
  try {
    const [users, bans] = await Promise.all([
      supa('users?select=id').catch(() => []),
      supa('ip_bans?is_active=eq.true&select=id').catch(() => []),
    ]);

    const userCount = Array.isArray(users) ? users.length : 0;
    const banCount = Array.isArray(bans) ? bans.length : 0;

    const desc = [
      '## � PickMyAI 시스템 상태',
      '',
      `👥 **총 유저**  ${userCount}명`,
      `🚫 **활성 차단 IP**  ${banCount}개`,
      `🌐 **사이트**  ${process.env.NEXT_PUBLIC_SITE_URL || 'https://pickmyai.store'}`,
      '',
      sep(),
      '',
      `🕐 **조회 시각**  ${kstNow()}`,
      `🔒 **보안 레이어**  8층 TrapNet 가동 중`,
      `📡 **Discord 관제소**  정상 연결`,
    ].join('\n');

    return { embeds: [buildEmbed({ title: '📊 관제소 상태', description: desc, color: C.CYAN })] };
  } catch (err: unknown) {
    return errorResponse(`상태 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /모델목록 — 크레딧 추가 시 참고용 모델 ID 목록 */
export async function handleModelList() {
  const groups: Record<string, string[]> = {};
  for (const [id, name] of Object.entries(MODEL_NAMES)) {
    if (id.includes('_48h')) continue; // 48h 배치 모델 제외
    const series = id.startsWith('gpt') ? 'GPT' :
      id.startsWith('haiku') || id.startsWith('sonnet') || id.startsWith('opus') ? 'Claude' :
      id.startsWith('sonar') || id.startsWith('deep') ? 'Perplexity' :
      id.startsWith('gemini') ? 'Gemini' :
      id.startsWith('grok') ? 'Grok' :
      id.startsWith('o3') || id.startsWith('o4') ? 'OpenAI Reasoning' :
      id.startsWith('dall') ? 'Image' : 'Other';
    if (!groups[series]) groups[series] = [];
    groups[series].push(`\`${id}\` → **${name}**`);
  }

  const sections = Object.entries(groups).map(([series, models]) =>
    `### ${series}\n${models.join('\n')}`
  ).join('\n\n');

  return { embeds: [buildEmbed({
    title: '🤖 사용 가능한 모델 목록',
    description: `크레딧 추가 시 아래 모델 ID를 사용하세요.\n\n${sections}`.slice(0, 3900),
    color: C.BLUE,
  })] };
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
      description: `${msg.slice(0, 1800)}\n\n> 🕐 ${kstNow()}`,
      color: C.RED,
    })],
  };
}

// ── 슬래시 커맨드에서 옵션 값 추출 ──
export function getOption(options: Array<{ name: string; value: unknown }> | undefined, name: string): unknown {
  return options?.find(o => o.name === name)?.value;
}
