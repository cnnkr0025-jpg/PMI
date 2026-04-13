import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  verifyDiscordRequest,
  InteractionType,
  InteractionResponseType,
  buildEmbed,
  getOption,
  handleUserInfo,
  handleUserDelete,
  handleCredit,
  handleBanIp,
  handleUnbanIp,
  handleBanList,
  handleStatus,
  handleButtonBanIp,
  handlePlanChange,
  handleModelList,
  handleCreditStatus,
  handleSiteHealth,
} from '@/lib/discord';

export const runtime = 'nodejs';

function splitCsvEnv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return timingSafeEqual(aa, bb);
}

function getInteractionUserId(interaction: any): string {
  return interaction?.member?.user?.id || interaction?.user?.id || '';
}

function getInteractionRoles(interaction: any): string[] {
  return Array.isArray(interaction?.member?.roles) ? interaction.member.roles : [];
}

function buildEphemeralErrorData(message: string): Record<string, unknown> {
  return {
    flags: 64,
    embeds: [buildEmbed({
      title: '⛔ 권한 또는 인증 오류',
      description: `${message}\n\n> 관리자에게 DISCORD_ADMIN_USER_IDS / DISCORD_ADMIN_ROLE_IDS / DISCORD_ADMIN_CODE 설정 확인 요청`,
      color: 0xe74c3c,
    })],
  };
}

async function validateAdminAccess(interaction: any, code?: string): Promise<Record<string, unknown> | null> {
  const adminUserIds = splitCsvEnv(process.env.DISCORD_ADMIN_USER_IDS);
  const adminRoleIds = splitCsvEnv(process.env.DISCORD_ADMIN_ROLE_IDS);
  const requiredCode = process.env.DISCORD_ADMIN_CODE || '';

  const userId = getInteractionUserId(interaction);
  const roleIds = getInteractionRoles(interaction);

  const userAllowed = adminUserIds.length > 0 && adminUserIds.includes(userId);
  const roleAllowed = adminRoleIds.length > 0 && roleIds.some(rid => adminRoleIds.includes(rid));

  if (adminUserIds.length === 0 && adminRoleIds.length === 0) {
    return buildEphemeralErrorData('관리자 허용 목록이 비어 있습니다.');
  }
  if (!userAllowed && !roleAllowed) {
    return buildEphemeralErrorData(`이 Discord 계정(${userId || 'unknown'})은 관리자 권한이 없습니다.`);
  }

  if (!requiredCode) {
    return buildEphemeralErrorData('DISCORD_ADMIN_CODE가 서버에 설정되지 않았습니다.');
  }
  if (!code || !timingSafeEqualString(code, requiredCode)) {
    return buildEphemeralErrorData('관리자 코드가 올바르지 않습니다.');
  }

  return null;
}

function validateAdminForButton(interaction: any): Record<string, unknown> | null {
  const adminUserIds = splitCsvEnv(process.env.DISCORD_ADMIN_USER_IDS);
  const adminRoleIds = splitCsvEnv(process.env.DISCORD_ADMIN_ROLE_IDS);

  const userId = getInteractionUserId(interaction);
  const roleIds = getInteractionRoles(interaction);

  const userAllowed = adminUserIds.length > 0 && adminUserIds.includes(userId);
  const roleAllowed = adminRoleIds.length > 0 && roleIds.some(rid => adminRoleIds.includes(rid));

  if (adminUserIds.length === 0 && adminRoleIds.length === 0) {
    return buildEphemeralErrorData('관리자 허용 목록이 비어 있습니다.');
  }
  if (!userAllowed && !roleAllowed) {
    return buildEphemeralErrorData(`이 Discord 계정(${userId || 'unknown'})은 버튼 실행 권한이 없습니다.`);
  }
  return null;
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY not set' }, { status: 500 });
  }

  // ── 서명 검증 ──
  const signature = request.headers.get('x-signature-ed25519') || '';
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  const body = await request.text();

  const isValid = await verifyDiscordRequest(publicKey, signature, timestamp, body);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // ── PING (Discord 엔드포인트 등록 시 검증) ──
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  // ── 슬래시 커맨드 ──
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { name } = interaction.data;
    const opts = interaction.data.options as Array<{ name: string; value: unknown }> | undefined;

    let responseData: Record<string, unknown>;

    switch (name) {
      case '유저조회': {
        const email = String(getOption(opts, '이메일') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleUserInfo(email);
        break;
      }
      case '유저삭제': {
        const email = String(getOption(opts, '이메일') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleUserDelete(email);
        break;
      }
      case '크레딧': {
        const email = String(getOption(opts, '이메일') || '');
        const model = String(getOption(opts, '모델') || '');
        const amount = Number(getOption(opts, '수량') || 0);
        const action = String(getOption(opts, '방식') || 'add');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleCredit(email, model, amount, action);
        break;
      }
      case '차단': {
        const ip = String(getOption(opts, 'ip') || '');
        const reason = String(getOption(opts, '사유') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleBanIp(ip, reason, interaction.member?.user?.username || 'discord');
        break;
      }
      case '차단해제': {
        const ip = String(getOption(opts, 'ip') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleUnbanIp(ip);
        break;
      }
      case '차단목록': {
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleBanList();
        break;
      }
      case '상태': {
        responseData = await handleStatus();
        break;
      }
      case '플랜변경': {
        const email = String(getOption(opts, '이메일') || '');
        const plan = String(getOption(opts, '플랜') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handlePlanChange(email, plan);
        break;
      }
      case '모델목록': {
        responseData = await handleModelList();
        break;
      }
      case '크레딧조회': {
        const email = String(getOption(opts, '이메일') || '');
        const code = String(getOption(opts, '코드') || '');
        const guard = await validateAdminAccess(interaction, code);
        if (guard) {
          responseData = guard;
          break;
        }
        responseData = await handleCreditStatus(email);
        break;
      }
      case '사이트상태': {
        responseData = await handleSiteHealth();
        break;
      }
      default:
        responseData = { content: `알 수 없는 명령어: ${name}` };
    }

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: responseData,
    });
  }

  // ── 버튼 클릭 (보안 알림 → 즉시 차단) ──
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id || '';

    if (customId.startsWith('ban_ip:')) {
      const guard = validateAdminForButton(interaction);
      if (guard) {
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: guard,
        });
      }

      const ip = customId.replace('ban_ip:', '');
      const responseData = {
        flags: 64,
        embeds: [buildEmbed({
          title: '🚫 IP 차단 요청 확인',
          description: `아래 IP를 정말 차단할까요?\n\n🕵️ **IP**  \`${ip}\`\n\n> 실수 방지를 위해 2차 확인이 필요합니다.`,
          color: 0xe67e22,
        })],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 4, label: '확인', custom_id: `ban_ip_confirm:${ip}` },
              { type: 2, style: 2, label: '취소', custom_id: `ban_ip_cancel:${ip}` },
            ],
          },
        ],
      };
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: responseData,
      });
    }

    if (customId.startsWith('ban_ip_confirm:')) {
      const guard = validateAdminForButton(interaction);
      if (guard) {
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: guard,
        });
      }
      const ip = customId.replace('ban_ip_confirm:', '');
      const responseData = await handleButtonBanIp(`ban_ip:${ip}`);
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { ...responseData, flags: 64 },
      });
    }

    if (customId.startsWith('ban_ip_cancel:')) {
      const guard = validateAdminForButton(interaction);
      if (guard) {
        return NextResponse.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: guard,
        });
      }
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: 64,
          embeds: [buildEmbed({
            title: '✅ 차단 취소됨',
            description: '요청이 취소되어 IP 차단이 실행되지 않았습니다.',
            color: 0x95a5a6,
          })],
        },
      });
    }

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '알 수 없는 버튼입니다.' },
    });
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}
