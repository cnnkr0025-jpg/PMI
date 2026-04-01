import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function hasValidMessages(messages: unknown): boolean {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) return false;

  return messages.every((message: any) => {
    if (!message || !['user', 'assistant', 'system'].includes(message.role)) return false;
    if (typeof message.content === 'string') return message.content.trim().length > 0 && message.content.length <= 50000;
    if (!Array.isArray(message.content)) return false;
    if (message.content.length > 24) return false;
    return message.content.every((part: any) => {
      if (!part || typeof part !== 'object') return false;
      if (part.type === 'text') return typeof part.text === 'string' && part.text.trim().length > 0 && part.text.length <= 50000;
      if (part.type === 'image_url') return typeof part.image_url?.url === 'string' && part.image_url.url.trim().length > 0;
      return false;
    });
  });
}

const batchRateLimiter = new RateLimiter(10, 60 * 1000);

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'ERR_CONFIG_01', reason: 'Batch storage is not configured.' }, { status: 500 });
    }

    const clientIp = getClientIp(request);
    const rl = batchRateLimiter.check(clientIp);
    if (!rl.success) {
      return NextResponse.json({ error: 'ERR_RATE', reason: 'Rate limit exceeded.' }, { status: 429 });
    }

    const session = await verifySession(request);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: 'ERR_AUTH', reason: '인증이 필요합니다.' }, { status: 401 });
    }

    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid request body.' }, { status: 400 });
    }

    const { modelId, messages, sessionId, messageId, language, speechLevel } = requestBody ?? {};

    if (typeof modelId !== 'string' || !modelId.trim() || typeof sessionId !== 'string' || !sessionId.trim() || typeof messageId !== 'string' || !messageId.trim()) {
      return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid request.' }, { status: 400 });
    }

    if (!hasValidMessages(messages)) {
      return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid messages.' }, { status: 400 });
    }

    const db = getDb();

    // batch_requests 테이블에 저장
    const { error } = await db.from('batch_requests').insert({
      user_id: session.userId,
      model_id: modelId,
      session_id: sessionId,
      message_id: messageId,
      messages: messages,
      language: language || 'ko',
      speech_level: speechLevel || 'formal',
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[Batch Submit] DB error:', error);
      const reason = process.env.NODE_ENV !== 'production'
        ? `DB 저장 실패: ${error.code} - ${error.message}`
        : 'DB 저장 실패';
      return NextResponse.json({ error: 'ERR_NET_00', reason }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: 'pending' });
  } catch (err: any) {
    console.error('[Batch Submit] Error:', err);
    return NextResponse.json({ error: 'ERR_UNKNOWN', reason: 'Internal error' }, { status: 500 });
  }
}
