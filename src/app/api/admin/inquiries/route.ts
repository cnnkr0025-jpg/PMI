import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAuthorizedAdminRequest } from '@/lib/adminAuth';
import { logError } from '@/lib/apiError';

// GET /api/admin/inquiries - 문의 목록 조회
export async function GET(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '권한 없음' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status') || 'all';

    let query = supabaseAdmin
      .from('user_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      logError('admin/inquiries GET', error);
      return NextResponse.json({ error: '문의 목록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ inquiries: data || [] });
  } catch (error) {
    logError('admin/inquiries GET', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/admin/inquiries - 문의 상태 변경 + 답변
export async function PATCH(request: NextRequest) {
  try {
    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.json({ error: '권한 없음' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : null;

    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

    const updates: Record<string, unknown> = {};

    if (typeof body.status === 'string' && ['open', 'resolved'].includes(body.status)) {
      updates.status = body.status;
    }
    if (typeof body.admin_reply === 'string') {
      updates.admin_reply = body.admin_reply.trim().slice(0, 3000);
      updates.replied_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '변경할 내용 없음' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('user_inquiries')
      .update(updates)
      .eq('id', id);

    if (error) {
      logError('admin/inquiries PATCH', error);
      return NextResponse.json({ error: '업데이트 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('admin/inquiries PATCH', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
