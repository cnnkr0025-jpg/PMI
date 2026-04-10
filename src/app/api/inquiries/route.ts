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

const VALID_TYPES = ['credit', 'pmc', 'model', 'other'] as const;

// POST /api/inquiries - 문의 제출
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 });

    const type = VALID_TYPES.includes(body.type) ? body.type : 'other';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const content = typeof body.content === 'string' ? body.content.trim().slice(0, 3000) : '';

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
    }

    // 스크린샷: base64 data URL 배열, 최대 3개, 각 1.5MB 이하
    const rawScreenshots = Array.isArray(body.screenshots) ? body.screenshots : [];
    const screenshots = rawScreenshots
      .filter((s: unknown) => typeof s === 'string' && s.startsWith('data:image/') && s.length < 1_500_000)
      .slice(0, 3);

    const { error } = await supabaseAdmin.from('user_inquiries').insert({
      user_id: user.userId,
      user_email: user.email,
      user_name: user.name || null,
      type,
      title,
      content,
      screenshots,
      status: 'open',
    });

    if (error) {
      logError('inquiries POST', error);
      return NextResponse.json({ error: '문의 전송에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('inquiries POST', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
