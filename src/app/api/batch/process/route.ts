import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiKeyManager } from '@/lib/apiKeyRotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const ANTHROPIC_BATCH_IDS = new Set([
  'haiku35_48h','haiku45_48h','sonnet45_48h','sonnet46_48h',
  'opus4_48h','opus41_48h','opus45_48h','opus46_48h',
]);

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  'haiku35_48h': 'claude-3-5-haiku-20241022',
  'haiku45_48h': 'claude-haiku-4-5',
  'sonnet45_48h': 'claude-sonnet-4-5',
  'sonnet46_48h': 'claude-sonnet-4-6',
  'opus4_48h': 'claude-opus-4-20250514',
  'opus41_48h': 'claude-opus-4-20250514',
  'opus45_48h': 'claude-opus-4-5',
  'opus46_48h': 'claude-opus-4-6',
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  'gpt5_48h': 'gpt-5',
  'gpt51_48h': 'gpt-5.1',
  'gpt52_48h': 'gpt-5.2',
  'gpt53instant_48h': 'gpt-5.3-chat-latest',
  'gpt54_48h': 'gpt-5.4',
  'gpt4o_48h': 'gpt-4o',
  'gpt41_48h': 'gpt-4.1',
  'o3_48h': 'o3',
  'o4mini_48h': 'o4-mini',
};

// POST /api/batch/process  (cron 또는 관리자 호출)
export async function POST(request: NextRequest) {
  // 보안 강화: CRON_SECRET 필수 — 미설정 시 무조건 거부
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // 1) pending 요청 수집
  const { data: pending, error: fetchErr } = await db
    .from('batch_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(500);

  if (fetchErr || !pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No pending requests' });
  }

  // 2) OpenAI / Anthropic 분리
  const openaiRequests = pending.filter((r: any) => !ANTHROPIC_BATCH_IDS.has(r.model_id));
  const anthropicRequests = pending.filter((r: any) => ANTHROPIC_BATCH_IDS.has(r.model_id));

  let processed = 0;

  // 3) OpenAI Batch 처리
  if (openaiRequests.length > 0) {
    const apiKey = apiKeyManager.getAvailableKey('openai');
    if (apiKey) {
      // JSONL 생성
      const lines = openaiRequests.map((r: any) => {
        const model = OPENAI_MODEL_MAP[r.model_id] || 'gpt-4o-mini';
        return JSON.stringify({
          custom_id: r.id,
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model,
            messages: r.messages,
            max_tokens: 2000,
          },
        });
      }).join('\n');

      try {
        // 파일 업로드
        const blob = new Blob([lines], { type: 'application/jsonl' });
        const formData = new FormData();
        formData.append('file', blob, 'batch.jsonl');
        formData.append('purpose', 'batch');

        const uploadRes = await fetch('https://api.openai.com/v1/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (uploadData.id) {
          // Batch 제출
          const batchRes = await fetch('https://api.openai.com/v1/batches', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input_file_id: uploadData.id,
              endpoint: '/v1/chat/completions',
              completion_window: '24h',
            }),
          });
          const batchData = await batchRes.json();

          if (batchData.id) {
            // DB에 batch_id 저장 + status → processing
            const ids = openaiRequests.map((r: any) => r.id);
            await db.from('batch_requests')
              .update({ status: 'processing', openai_batch_id: batchData.id })
              .in('id', ids);
            processed += openaiRequests.length;
          }
        }
      } catch (e) {
        console.error('[Batch Process] OpenAI batch error:', e);
      }
    }
  }

  // 4) Anthropic Batch 처리
  if (anthropicRequests.length > 0) {
    const apiKey = apiKeyManager.getAvailableKey('anthropic');
    if (apiKey) {
      const requests = anthropicRequests.map((r: any) => {
        const model = ANTHROPIC_MODEL_MAP[r.model_id] || 'claude-3-5-haiku-20241022';
        const systemMsg = r.messages.find((m: any) => m.role === 'system');
        const convMsgs = r.messages.filter((m: any) => m.role !== 'system');
        return {
          custom_id: r.id,
          params: {
            model,
            max_tokens: 2000,
            system: systemMsg?.content || 'You are a helpful assistant.',
            messages: convMsgs,
          },
        };
      });

      try {
        const batchRes = await fetch('https://api.anthropic.com/v1/messages/batches', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'message-batches-2024-09-24',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests }),
        });
        const batchData = await batchRes.json();

        if (batchData.id) {
          const ids = anthropicRequests.map((r: any) => r.id);
          await db.from('batch_requests')
            .update({ status: 'processing', anthropic_batch_id: batchData.id })
            .in('id', ids);
          processed += anthropicRequests.length;
        }
      } catch (e) {
        console.error('[Batch Process] Anthropic batch error:', e);
      }
    }
  }

  return NextResponse.json({ processed, openai: openaiRequests.length, anthropic: anthropicRequests.length });
}
