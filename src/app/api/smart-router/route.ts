import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/apiAuth';
import { RateLimiter } from '@/lib/rateLimit';
import { logError } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const smartRouterLimiter = new RateLimiter(15, 60 * 1000); // 분당 15회

export async function POST(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session.authenticated || !session.userId) {
      return NextResponse.json({ error: 'ERR_AUTH', reason: '로그인이 필요합니다.' }, { status: 401 });
    }

    const rl = smartRouterLimiter.check(session.userId);
    if (!rl.success) {
      return NextResponse.json({ error: 'ERR_RATE', reason: '요청이 너무 많습니다.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const { question, models, speechLevel, language, premium } = body;

    if (!question?.trim()) {
      return NextResponse.json({ error: '질문이 없습니다.' }, { status: 400 });
    }

    // 입력 길이 제한 (과도한 토큰 소비 방지)
    if (typeof question === 'string' && question.length > 5000) {
      return NextResponse.json({ error: '질문이 너무 깁니다.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 500 });
    }

    const modelList = (models || []).map((m: any) => `- ${m.displayName} (${m.description || ''})`).join('\n');
    const tone = speechLevel === 'informal' ? '반말로 짧게' : '존댓말로 짧게';

    let systemPrompt: string;
    let userPrompt: string;

    if (premium) {
      // 프리미엄: 5위까지 순위와 이유
      systemPrompt = `당신은 AI 모델 추천 전문가입니다. 사용자의 질문을 분석해서 가장 적합한 AI 모델을 순위별로 추천해주세요. 반드시 제공된 표시명(display name)만 사용하고, 내부 코드명이나 ID(gpt52, haiku45 같은 값)는 절대 출력하지 마세요.`;
      userPrompt = `사용 가능한 AI 모델 목록:\n${modelList}\n\n사용자 질문: "${question}"\n\n위 질문에 가장 적합한 모델을 1위부터 5위까지 ${tone} 추천해주세요. 각 모델마다 모델명과 한 줄 이유를 포함하세요. 반드시 위 목록에 있는 표시명만 그대로 쓰고, 없는 모델은 제외하세요.`;
    } else {
      // 일반: 1줄 추천
      systemPrompt = `당신은 AI 모델 추천 전문가입니다. 사용자의 질문에 가장 적합한 AI 모델을 1줄로 추천해주세요. 반드시 제공된 표시명(display name)만 사용하고, 내부 코드명이나 ID(gpt52, haiku45 같은 값)는 절대 출력하지 마세요.`;
      userPrompt = `사용 가능한 AI 모델 목록:\n${modelList}\n\n사용자 질문: "${question}"\n\n${tone} 어떤 모델이 가장 좋을지 1줄로만 말해주세요. 반드시 위 목록에 있는 실제 표시명만 포함하세요.`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: premium ? 400 : 80,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      // 업스트림 에러 원문은 서버 로그에만 기록, 클라이언트에는 일반 메시지
      const errText = await response.text().catch(() => '');
      logError('smart-router/openai', `status=${response.status} body=${errText}`);
      return NextResponse.json({ error: 'AI 서비스를 일시적으로 사용할 수 없습니다.' }, { status: 502 });
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ error: 'AI 서비스 응답이 올바르지 않습니다.' }, { status: 502 });
    }
    const recommendation = data.choices?.[0]?.message?.content?.trim() || '추천을 가져올 수 없습니다.';

    return NextResponse.json({ recommendation });
  } catch (error) {
    logError('smart-router', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
