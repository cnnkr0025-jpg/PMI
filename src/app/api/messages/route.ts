import { NextRequest, NextResponse } from 'next/server';
import { verifySecureToken } from '@/lib/secureAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logError } from '@/lib/apiError';

async function getAuthedUser(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return null;
  const result = await verifySecureToken(token);
  if (!result.valid || !result.payload) return null;
  return result.payload;
}

// GET /api/messages - 내 메시지 목록 + 읽지 않은 수
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const countOnly = request.nextUrl.searchParams.get('count') === 'true';

    // 나에게 온 메시지 또는 전체 공지
    const { data: messages, error } = await supabaseAdmin
      .from('admin_messages')
      .select('id, title, content, to_user_id, from_admin_email, created_at')
      .or(`to_user_id.eq.${user.userId},to_user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(countOnly ? 200 : 50);

    if (error) {
      logError('messages GET', error);
      return NextResponse.json({ error: '메시지를 불러올 수 없습니다.' }, { status: 500 });
    }

    // 읽음 기록 조회
    const msgIds = (messages || []).map((m: any) => m.id);
    let readIds = new Set<string>();

    if (msgIds.length > 0) {
      const { data: reads } = await supabaseAdmin
        .from('user_message_reads')
        .select('message_id')
        .eq('user_id', user.userId)
        .in('message_id', msgIds);

      readIds = new Set((reads || []).map((r: any) => r.message_id));
    }

    const enriched = (messages || []).map((m: any) => ({
      ...m,
      is_read: readIds.has(m.id),
    }));

    const unreadCount = enriched.filter((m: any) => !m.is_read).length;

    if (countOnly) {
      return NextResponse.json({ unreadCount });
    }

    return NextResponse.json({ messages: enriched, unreadCount });
  } catch (error) {
    logError('messages GET', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/messages - 메시지 읽음 처리
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const messageId = typeof body?.messageId === 'string' ? body.messageId : null;

    if (!messageId) {
      return NextResponse.json({ error: '메시지 ID 필요' }, { status: 400 });
    }

    // upsert로 중복 방지
    const { error } = await supabaseAdmin
      .from('user_message_reads')
      .upsert(
        { message_id: messageId, user_id: user.userId },
        { onConflict: 'message_id,user_id' }
      );

    if (error) {
      logError('messages POST (read)', error);
      return NextResponse.json({ error: '읽음 처리 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('messages POST', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
