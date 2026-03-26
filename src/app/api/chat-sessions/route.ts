import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter } from '@/lib/rateLimit';

const sessionReadLimiter = new RateLimiter(60, 60 * 1000); // 분당 60회
const sessionWriteLimiter = new RateLimiter(30, 60 * 1000); // 분당 30회

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    const userId = sessionResult.userId;

    const rl = sessionReadLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const { data: sessions, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Chat sessions fetch error:', error.message, error.code);
      }
      return NextResponse.json({ error: '채팅 세션을 불러오는데 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Chat sessions API error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    const userId = sessionResult.userId;

    const rl = sessionWriteLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const { sessionId, title, messages, isStarred } = body;

    if (!sessionId || typeof sessionId !== 'string' || !title || typeof title !== 'string' || !messages) {
      return NextResponse.json({ error: '필수 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    // 메시지 크기 제한 (DoS 방지)
    if (Array.isArray(messages) && messages.length > 2000) {
      return NextResponse.json({ error: '메시지 수가 너무 많습니다.' }, { status: 400 });
    }

    // 입력 길이 제한
    if (sessionId.length > 200 || title.length > 500) {
      return NextResponse.json({ error: '입력값이 너무 깁니다.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .upsert({
        user_id: userId,
        session_id: sessionId,
        title: title.slice(0, 500),
        messages,
        is_starred: Boolean(isStarred),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,session_id'
      })
      .select();

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Chat session save error:', error.message, error.code);
      }
      return NextResponse.json({ error: '채팅 세션 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, session: data?.[0] });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Chat sessions API error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await verifySession(request);
    
    if (!sessionResult.authenticated || !sessionResult.userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    
    const userId = sessionResult.userId;

    const rl = sessionWriteLimiter.check(userId);
    if (!rl.success) {
      return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const { sessionId } = body || {};

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
      return NextResponse.json({ error: 'sessionId가 유효하지 않습니다.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('chat_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId);

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Chat session delete error:', error.message, error.code);
      }
      return NextResponse.json({ error: '채팅 세션 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Chat sessions API error:', error);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
