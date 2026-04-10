import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';
import { logError } from '@/lib/apiError';

// POST /api/admin/send-message - 메시지 발송 (특정 사용자 또는 전체 공지)
export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '권한 없음' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 });

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 3000) : '';
    const toUserId = typeof body.to_user_id === 'string' ? body.to_user_id.trim() : null;

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('admin_messages').insert({
      title,
      content,
      to_user_id: toUserId || null,
      from_admin_email: 'admin@pick-my-ai',
    });

    if (error) {
      logError('admin/send-message POST', error);
      return NextResponse.json({ error: '메시지 발송 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('admin/send-message POST', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
