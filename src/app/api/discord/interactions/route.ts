import { NextResponse } from 'next/server';
import {
  verifyDiscordRequest,
  InteractionType,
  InteractionResponseType,
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
        responseData = await handleUserInfo(email);
        break;
      }
      case '유저삭제': {
        const email = String(getOption(opts, '이메일') || '');
        responseData = await handleUserDelete(email);
        break;
      }
      case '크레딧': {
        const email = String(getOption(opts, '이메일') || '');
        const model = String(getOption(opts, '모델') || '');
        const amount = Number(getOption(opts, '수량') || 0);
        const action = String(getOption(opts, '방식') || 'add');
        responseData = await handleCredit(email, model, amount, action);
        break;
      }
      case '차단': {
        const ip = String(getOption(opts, 'ip') || '');
        const reason = String(getOption(opts, '사유') || '');
        responseData = await handleBanIp(ip, reason, interaction.member?.user?.username || 'discord');
        break;
      }
      case '차단해제': {
        const ip = String(getOption(opts, 'ip') || '');
        responseData = await handleUnbanIp(ip);
        break;
      }
      case '차단목록': {
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
        responseData = await handlePlanChange(email, plan);
        break;
      }
      case '모델목록': {
        responseData = await handleModelList();
        break;
      }
      case '크레딧조회': {
        const email = String(getOption(opts, '이메일') || '');
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
      const responseData = await handleButtonBanIp(customId);
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: responseData,
      });
    }

    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '알 수 없는 버튼입니다.' },
    });
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}
