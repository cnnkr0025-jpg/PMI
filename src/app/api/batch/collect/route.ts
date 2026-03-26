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

// POST /api/batch/collect  (cron 호출 - 처리 완료된 결과 수집)
export async function POST(request: NextRequest) {
  try {
  // 보안 강화: CRON_SECRET 필수 — 미설정 시 무조건 거부
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  let collected = 0;

  // 1) OpenAI 처리 중인 배치 조회
  const { data: openaiProcessing } = await db
    .from('batch_requests')
    .select('id, openai_batch_id')
    .eq('status', 'processing')
    .not('openai_batch_id', 'is', null);

  if (openaiProcessing && openaiProcessing.length > 0) {
    const apiKey = apiKeyManager.getAvailableKey('openai');
    if (apiKey) {
      // 고유 batch_id 목록
      const batchIds = [...new Set(openaiProcessing.map((r: any) => r.openai_batch_id))];

      for (const batchId of batchIds) {
        try {
          const batchRes = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          const batchData = await batchRes.json();

          if (batchData.status === 'completed' && batchData.output_file_id) {
            // 결과 파일 다운로드
            const fileRes = await fetch(`https://api.openai.com/v1/files/${batchData.output_file_id}/content`, {
              headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            const text = await fileRes.text();
            const lines = text.trim().split('\n').filter(Boolean);

            for (const line of lines) {
              try {
                const result = JSON.parse(line);
                const customId = result.custom_id;
                const content = result.response?.body?.choices?.[0]?.message?.content || '';
                const isError = result.response?.status_code !== 200;

                await db.from('batch_requests')
                  .update({
                    status: isError ? 'failed' : 'completed',
                    result: isError ? null : content,
                    error_message: isError ? 'OpenAI batch failed' : null,
                    completed_at: new Date().toISOString(),
                  })
                  .eq('id', customId);

                collected++;
              } catch {}
            }
          } else if (batchData.status === 'failed' || batchData.status === 'expired') {
            const ids = openaiProcessing
              .filter((r: any) => r.openai_batch_id === batchId)
              .map((r: any) => r.id);
            await db.from('batch_requests')
              .update({ status: 'failed', error_message: `Batch ${batchData.status}`, completed_at: new Date().toISOString() })
              .in('id', ids);
          }
        } catch (e) {
          console.error('[Batch Collect] OpenAI error:', e);
        }
      }
    }
  }

  // 2) Anthropic 처리 중인 배치 조회
  const { data: anthropicProcessing } = await db
    .from('batch_requests')
    .select('id, anthropic_batch_id')
    .eq('status', 'processing')
    .not('anthropic_batch_id', 'is', null);

  if (anthropicProcessing && anthropicProcessing.length > 0) {
    const apiKey = apiKeyManager.getAvailableKey('anthropic');
    if (apiKey) {
      const batchIds = [...new Set(anthropicProcessing.map((r: any) => r.anthropic_batch_id))];

      for (const batchId of batchIds) {
        try {
          const batchRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'message-batches-2024-09-24',
            },
          });
          const batchData = await batchRes.json();

          if (batchData.processing_status === 'ended') {
            // 결과 스트림 다운로드
            const resultsRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}/results`, {
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'message-batches-2024-09-24',
              },
            });
            const text = await resultsRes.text();
            const lines = text.trim().split('\n').filter(Boolean);

            for (const line of lines) {
              try {
                const result = JSON.parse(line);
                const customId = result.custom_id;
                const isError = result.result?.type !== 'succeeded';
                const content = result.result?.message?.content?.[0]?.text || '';

                await db.from('batch_requests')
                  .update({
                    status: isError ? 'failed' : 'completed',
                    result: isError ? null : content,
                    error_message: isError ? 'Anthropic batch failed' : null,
                    completed_at: new Date().toISOString(),
                  })
                  .eq('id', customId);

                collected++;
              } catch {}
            }
          }
        } catch (e) {
          console.error('[Batch Collect] Anthropic error:', e);
        }
      }
    }
  }

  return NextResponse.json({ collected });
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[batch/collect] Unexpected error:', err);
    }
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
