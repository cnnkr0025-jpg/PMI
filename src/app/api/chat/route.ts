import { NextRequest, NextResponse } from 'next/server';
import { PHASE_EXPORT, PHASE_PRODUCTION_BUILD } from 'next/constants';
import { createClient } from '@supabase/supabase-js';
import { RateLimiter, getClientIp } from '@/lib/rateLimit';
import { verifySession } from '@/lib/apiAuth';
import { apiKeyManager, parseRateLimitError } from '@/lib/apiKeyRotation';
import { fetchWithRetry } from '@/utils/fetchWithRetry';
import { appendLedgerEvent } from '@/lib/wallet/ledger';
import { isShadowedAny, getShadowSeedForUser } from '@/lib/security/shadowContext';
import { generateSyntheticAiResponse, getSyntheticResponseDelay } from '@/lib/security/shadowDataset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const isStaticExportPhase =
  process.env.NEXT_PHASE === PHASE_EXPORT ||
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

// Rate Limiter 인스턴스 생성 (분당 20회 제한)
const chatRateLimiter = new RateLimiter(20, 60 * 1000);

const isNetlify = process.env.NETLIFY === 'true' || process.env.NETLIFY_LOCAL === 'true';
const OPENAI_STREAMING_ALLOWED = process.env.OPENAI_STREAMING_DISABLED !== 'true';
const DEBUG_LOGS = process.env.DEBUG_API_LOGS === 'true';
// Netlify 무료 플랜: 함수 타임아웃 10초 → API 호출은 8초 이내 완료 필요
// Netlify Pro 플랜: 함수 타임아웃 26초 → API 호출은 24초 이내
const NETLIFY_FUNCTION_TIMEOUT = Number(process.env.NETLIFY_FUNCTION_TIMEOUT_MS) || 10000;
const DEFAULT_API_TIMEOUT_MS = Number(process.env.AI_API_TIMEOUT_MS) || (isNetlify ? Math.max(NETLIFY_FUNCTION_TIMEOUT - 2000, 5000) : 120000);
const STREAM_CONNECT_TIMEOUT_MS = Number(process.env.AI_STREAM_CONNECT_TIMEOUT_MS) || (isNetlify ? Math.max(NETLIFY_FUNCTION_TIMEOUT - 3000, 4000) : 60000);
// Netlify에서는 재시도 시간이 부족하므로 0회, 로컬에서는 2회
const DEFAULT_API_RETRIES = process.env.AI_API_MAX_RETRIES != null ? Number(process.env.AI_API_MAX_RETRIES) : (isNetlify ? 0 : 2);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.AI_API_RETRY_DELAY_MS) || 800;

const OPENAI_STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-store',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff',
};

const PSEUDO_STREAM_HEADERS = {
  ...OPENAI_STREAM_HEADERS,
  'Transfer-Encoding': 'chunked',
};

const STREAM_TEXT_ENCODER = new TextEncoder();
const ANTHROPIC_MODEL_IDS = new Set(['haiku35', 'sonnet35', 'haiku45', 'sonnet45', 'opus45', 'sonnet46', 'opus46', 'opus4']);
const PERPLEXITY_MODEL_IDS = new Set(['sonar', 'sonarPro', 'deepResearch']);
const IMAGE_MODEL_IDS = new Set(['gptimage1', 'dalle3']);
const GROK_TEXT_IDS = new Set(['grok3mini', 'grok3', 'grok4fastNR', 'grok4fastR', 'grok41fastNR', 'grok41fastR', 'grok40709', 'grokCodeFast1']);
const GROK_IMAGE_IDS = new Set(['grokImagine', 'grok2image']);
const GROK_VIDEO_IDS = new Set(['grokImagineVideo']);

function getServerDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('[ERR_CONFIG_02] Supabase server config missing.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Append-only Ledger 기반 크레딧 차감 (wallet_ledger reserve)
async function consumeChatCredit(userId: string, modelId: string): Promise<boolean> {
  const key = `chat-use-${modelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await appendLedgerEvent({
    userId,
    eventType: 'reserve',
    delta: -1,
    idempotencyKey: key,
    metadata: { modelId, action: 'chat_credit_consume' },
  });
  return result.success;
}

// Append-only Ledger 기반 크레딧 환불 (오류 보상)
async function refundChatCredit(userId: string, modelId: string): Promise<void> {
  const key = `chat-refund-${modelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await appendLedgerEvent({
    userId,
    eventType: 'cancel',
    delta: 1,
    idempotencyKey: key,
    metadata: { modelId, action: 'chat_credit_refund' },
  });
}

// 영상 모델: 초 단위 Ledger 차감
async function consumeVideoCredits(userId: string, modelId: string, seconds: number): Promise<boolean> {
  const key = `video-use-${modelId}-${seconds}s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await appendLedgerEvent({
    userId,
    eventType: 'reserve',
    delta: -seconds,
    idempotencyKey: key,
    metadata: { modelId, action: 'video_credit_consume', seconds },
  });
  return result.success;
}

// 영상 모델: 초 단위 Ledger 환불
async function refundVideoCredits(userId: string, modelId: string, seconds: number): Promise<void> {
  const key = `video-refund-${modelId}-${seconds}s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await appendLedgerEvent({
    userId,
    eventType: 'cancel',
    delta: seconds,
    idempotencyKey: key,
    metadata: { modelId, action: 'video_credit_refund', seconds },
  });
}

const OPENAI_MODEL_MAP: { [key: string]: string } = {
  'gpt4o': 'gpt-4o',
  'gpt41': 'gpt-4.1',
  'gpt41mini': 'gpt-4.1-mini',
  'gpt41nano': 'gpt-4.1-nano',
  'gpt5': 'gpt-5',
  'gpt51': 'gpt-5.1',
  'gpt52': 'gpt-5.2',
  'gpt53instant': 'gpt-5.3-chat-latest',
  'gpt54': 'gpt-5.4',
  'gpt5codex': 'gpt-5-codex',
  'gpt51codex': 'gpt-5.1-codex',
  'gpt51codexmax': 'gpt-5.1-codex',
  'gpt52codex': 'gpt-5.2-codex',
  'o3': 'o3',
  'o3mini': 'o3-mini',
  'o4mini': 'o4-mini',
  'gptimage1': 'gpt-image-1',
  'dalle3': 'dall-e-3',
};

function findLastMessageByRole(messages: any[], role: string) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === role) {
      return messages[i];
    }
  }

  return null;
}

function findLastMessageIndexByRole(messages: any[], role: string) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === role) {
      return i;
    }
  }

  return -1;
}

function buildPseudoStream(responseContent: string) {
  return new ReadableStream({
    start(ctrl) {
      try {
        for (let i = 0; i < responseContent.length; ) {
          const chunkSize = i < 200 ? 4 : i < 1000 ? 12 : 40;
          const chunk = responseContent.slice(i, i + chunkSize);
          ctrl.enqueue(STREAM_TEXT_ENCODER.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
          i += chunkSize;
        }

        ctrl.enqueue(STREAM_TEXT_ENCODER.encode('data: [DONE]\n\n'));
        ctrl.close();
      } catch {
        ctrl.enqueue(STREAM_TEXT_ENCODER.encode(`data: ${JSON.stringify({ error: 'ERR_STREAM' })}\n\ndata: [DONE]\n\n`));
        ctrl.close();
      }
    }
  });
}

type UserAttachment = {
  type: 'image' | 'text';
  name: string;
  dataUrl?: string;
  content?: string;
};

function normalizeMaxOutputTokens(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  if (normalized <= 0) return undefined;
  return Math.min(normalized, 8192);
}

function normalizeTemperature(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(2, Math.max(0, value));
}

function hasMeaningfulMessageContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;

  return content.some((part: any) => {
    if (part?.type === 'text' && typeof part.text === 'string') {
      return part.text.trim().length > 0;
    }
    if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
      return part.image_url.url.trim().length > 0;
    }
    return false;
  });
}

const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'text/plain', 'text/csv', 'application/pdf',
]);

const MIME_EXTENSION_MAP: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/gif': ['gif'],
  'image/webp': ['webp'], 'image/svg+xml': ['svg'],
  'text/plain': ['txt'], 'text/csv': ['csv'], 'application/pdf': ['pdf'],
};

function extractBase64(dataUrl: string, filename?: string): { mime: string; base64: string } | null {
  try {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return null;
    const mime = match[1];
    if (!ALLOWED_MIME_TYPES.has(mime)) return null;
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const allowedExts = MIME_EXTENSION_MAP[mime];
      if (allowedExts && !allowedExts.includes(ext)) return null;
    }
    return { mime, base64: match[2] };
  } catch {
    return null;
  }
}

// 이미지 생성 API 호출 (gpt-image-1, dall-e-3 등)
async function callImageGeneration(prompt: string, model: string): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('openai');
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured.');
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Image Gen] Generating image with ${model}, prompt:`, prompt);
  }

  let response: Response;
  try {
    response = await fetchWithRetry('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model === 'gpt-image-1' ? 'gpt-image-1' : 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: model === 'gpt-image-1' ? 'auto' : 'standard'
      })
    }, {
      timeout: DEFAULT_API_TIMEOUT_MS,
      maxRetries: DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError') {
      throw new Error('MODEL_RESPONSE_TIMEOUT');
    }
    throw new Error(`Image API call failed: ${fetchError?.message || 'Unknown error'}`);
  }

  if (!response.ok) {
    const errorData = await response.json();
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Image Gen] Error response:', errorData);
    }
    throw new Error(errorData.error?.message || 'Image API error');
  }

  const data = await response.json();
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Image Gen] Image generated successfully with ${model}`);
  }

  // 이미지 URL 반환
  return data.data[0].url;
}

// OpenAI API 호출 (키 로테이션 및 큐 시스템 지원)
async function callOpenAI(model: string, messages: any[], userAttachments?: UserAttachment[], persona?: any, languageInstruction?: string, streaming?: boolean, maxOutputTokens?: number): Promise<string | Response> {
  // 이미지 생성 모델인 경우 이미지 생성 API 사용
  if (model === 'gptimage1' || model === 'dalle3') {
    const lastUserMessage = findLastMessageByRole(messages, 'user');
    const prompt = typeof lastUserMessage?.content === 'string' 
      ? lastUserMessage.content 
      : lastUserMessage?.content?.[0]?.text || 'Beautiful landscape';
    const apiModel = model === 'gptimage1' ? 'gpt-image-1' : 'dall-e-3';
    return await callImageGeneration(prompt, apiModel);
  }

  const apiKey = apiKeyManager.getAvailableKey('openai');
  
  if (!apiKey) {
    console.error('[OpenAI] No API key available');
    throw new Error('[ERR_KEY_01] OpenAI API key not configured.');
  }

  const shouldStream = !!(streaming && OPENAI_STREAMING_ALLOWED);

  return await executeOpenAIRequest(
    model,
    messages,
    apiKey,
    userAttachments,
    persona,
    0,
    languageInstruction,
    shouldStream,
    maxOutputTokens
  );
}

// OpenAI 실제 요청 실행 - 스트리밍 시 Response, 아니면 문자열 반환
async function executeOpenAIRequest(model: string, messages: any[], apiKey: string, userAttachments?: UserAttachment[], persona?: any, retryCount: number = 0, languageInstruction?: string, streaming?: boolean, maxOutputTokens?: number): Promise<string | Response> {

  // If there are image attachments, convert the LAST user message content to a multimodal array
  const transformedMessages = (() => {
    if (!userAttachments?.length) return messages;
    const lastIdx = findLastMessageIndexByRole(messages, 'user');
    if (lastIdx === -1) return messages;
    const last = messages[lastIdx];
    const parts: any[] = [];
    if (typeof last.content === 'string') {
      parts.push({ type: 'text', text: last.content });
    } else if (Array.isArray(last.content)) {
      parts.push(...last.content);
    }
    userAttachments.forEach(att => {
      if (att.type === 'image' && att.dataUrl) {
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      } else if (att.type === 'text' && att.content) {
        parts.push({ type: 'text', text: `File (${att.name}):\n${att.content.slice(0, 4000)}` });
      }
    });
    const newMsgs = [...messages];
    newMsgs[lastIdx] = { role: 'user', content: parts };
    return newMsgs;
  })();

  const selectedModel = OPENAI_MODEL_MAP[model];
  if (!selectedModel) {
    throw new Error('Model mapping not configured. Check .env.local');
  }

  // 페르소나 기반 시스템 프롬프트 생성
  const buildPersonaPrompt = (persona: any) => {
    if (!persona) return '';
    
    let prompt = `You are "${persona.name}".\n\n`;
    
    if (persona.personality) {
      const p = persona.personality;
      prompt += `Personality:\n`;
      prompt += `- Tone: ${p.tone === 'formal' ? 'formal' : p.tone === 'casual' ? 'casual' : p.tone === 'friendly' ? 'friendly' : p.tone === 'professional' ? 'professional' : 'humorous'}\n`;
      prompt += `- Style: ${p.language === 'polite' ? 'polite' : p.language === 'casual' ? 'casual' : 'technical'}\n`;
      prompt += `- Emotion: ${p.emotionLevel}/10\n`;
      prompt += `- Emoji: ${p.emojiUsage ? 'use' : 'no'}\n`;
      prompt += `- Length: ${p.responseLength === 'concise' ? 'concise' : p.responseLength === 'balanced' ? 'balanced' : 'detailed'}\n\n`;
    }
    
    if (persona.expertise && persona.expertise.domains && persona.expertise.domains.length > 0) {
      prompt += `Expertise: ${persona.expertise.domains.join(', ')}\n`;
      prompt += `Level: ${persona.expertise.level === 'beginner' ? 'beginner' : persona.expertise.level === 'intermediate' ? 'intermediate' : 'expert'}\n\n`;
    }
    
    if (persona.speechPatterns) {
      if (persona.speechPatterns.greetings && persona.speechPatterns.greetings.length > 0) {
        prompt += `Greeting: ${persona.speechPatterns.greetings[0]}\n`;
      }
      if (persona.speechPatterns.catchPhrases && persona.speechPatterns.catchPhrases.length > 0) {
        prompt += `Phrases: ${persona.speechPatterns.catchPhrases.join(', ')}\n`;
      }
    }
    
    prompt += `\nReflect these traits in responses.`;
    return prompt;
  };
  
  // GPT-5/5.1 및 코딩 모델용 시스템 메시지 추가
  const isGPT5Series = model === 'gpt5' || model === 'gpt51' || model === 'gpt52' || model === 'gpt53instant' || model === 'gpt54';
  const isCodingModel = model === 'codex' || model === 'gpt5codex' || model === 'gpt51codex';
  
  // 대화의 첫 메시지인지 확인 (시스템 메시지 제외하고 사용자 메시지가 1개인 경우)
  const isFirstMessage = transformedMessages.filter((m: any) => m.role === 'user').length === 1;
  
  // 코드 블록 규칙 (첫 메시지에만 포함)
  const codeBlockRule = isFirstMessage 
    ? '\nCode in ```lang blocks.'
    : '';
  
  // 요약 규칙 (매 메시지마다 포함)
  const summaryRule = '\nAt the very end of every response, add a hidden summary wrapped in ~~ markers. Format:\n~~\nQ: (user question summary in 10 words)\nA: (your response summary in 15 words)\nKey: (important facts/names/numbers mentioned)\n~~\nThis summary block is invisible to the user. Always include it.';
  
  // ChatGPT 기본 지침 (짧고 강력하게, 예시 포함)
  const chatGPTGuidelines = `Best friend AI. Rules: wild reactions, 3+ emojis, ALL CAPS hype, casual texting tone, never formal, short punchy sentences.
Example style:
"OMG WAIT 🔥🔥🔥 bro that's INSANE!! okay okay let me break it down 👇
💡 [answer]
🎯 [key point]
😤 honestly you're gonna CRUSH this!!"`;

  const speechStylePrompt = languageInstruction?.includes('반말') || languageInstruction?.includes('informal')
    ? '\n반드시 반말(casual/informal Korean)로만 답변하세요. 존댓말을 절대 섞지 마세요.'
    : '\n반드시 존댓말(polite Korean)로만 답변하세요. 반말을 절대 섞지 마세요.';

  const gptFormatGuidelines = `\nFormatting: break info into digestible chunks; avoid long narrative paragraphs; prefer compact bullets and short sections. Use ## for sections, ### for subsections. Use markdown tables for comparisons.`;

  const baseSystemPrompt = isGPT5Series
    ? `${chatGPTGuidelines}\nYou are GPT-5 series, the most capable model. Give thorough, insightful answers. Use **bold** for emphasis, ## headings for sections. Be comprehensive yet engaging.${gptFormatGuidelines}${codeBlockRule}${summaryRule}${speechStylePrompt}`
    : isCodingModel
    ? `${chatGPTGuidelines}\nYou are a world-class coding assistant. Write clean, well-commented code. Explain your reasoning. Debug thoroughly. Suggest optimizations.${gptFormatGuidelines}${codeBlockRule}${summaryRule}${speechStylePrompt}`
    : `${chatGPTGuidelines}\nGive detailed, helpful responses. Use **bold** for key points, ## headings when appropriate. Make your answers fun and engaging.${gptFormatGuidelines}${codeBlockRule}${summaryRule}${speechStylePrompt}`;
  
  const personaPrompt = persona ? buildPersonaPrompt(persona) : '';

  const systemContent = [baseSystemPrompt, personaPrompt, languageInstruction]
    .filter(Boolean)
    .join('\n\n');
  
  const finalMessages = systemContent
    ? [
        {
          role: 'system',
          content: systemContent
        },
        ...transformedMessages
      ]
    : transformedMessages;

  // Codex 모델은 /v1/responses 엔드포인트 사용
  const isCodex = selectedModel.includes('codex');
  const endpoint = isCodex 
    ? 'https://api.openai.com/v1/responses'
    : 'https://api.openai.com/v1/chat/completions';

  // 모델별 max_tokens 설정
  let maxTokens = 1200; // GPT-5/5.1/5.2/Codex 기본값
  if (model === 'gpt4o' || model === 'gpt41') {
    maxTokens = 800; // GPT-4.1 / GPT-4o
  }
  if (typeof maxOutputTokens === 'number') {
    maxTokens = Math.min(maxTokens, maxOutputTokens);
  }
  
  const requestBody: any = {
    model: selectedModel,
    messages: finalMessages,
    max_completion_tokens: maxTokens,
    stream: !!(streaming && !isCodex)
  };
  
  // GPT-5 시리즈는 low reasoning으로 빠르게 응답 (minimal은 일부 모델에서 미지원)
  if (isGPT5Series) {
    requestBody.reasoning_effort = 'low';
  } else {
    // GPT-5 시리즈가 아닌 경우에만 temperature 추가
    requestBody.temperature = 0.9;
  }

  // Responses API는 다른 파라미터 구조 사용
  let apiRequestBody: any;
  if (isCodex) {
    apiRequestBody = {
      model: requestBody.model,
      input: requestBody.messages,
      max_output_tokens: requestBody.max_completion_tokens,
    };
    if (requestBody.temperature !== undefined) {
      apiRequestBody.temperature = requestBody.temperature;
    }
  } else {
    apiRequestBody = requestBody;
  }

  // 스트리밍은 연결 타임아웃, 비스트리밍은 응답 타임아웃
  const connectTimeout = streaming ? STREAM_CONNECT_TIMEOUT_MS : DEFAULT_API_TIMEOUT_MS;

  if (DEBUG_LOGS) {
    console.log('[OpenAI] API request:', { model: selectedModel, stream: requestBody.stream });
  }

  let response: Response;
  try {
    response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(apiRequestBody)
    }, {
      timeout: connectTimeout,
      maxRetries: streaming ? 1 : DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS
    });
  } catch (fetchError: any) {
    console.error('[OpenAI] Fetch failed:', fetchError?.message);
    if (fetchError?.name === 'AbortError') {
      throw new Error('MODEL_RESPONSE_TIMEOUT');
    }
    throw new Error(`[ERR_NET_01] OpenAI connection failed`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (process.env.NODE_ENV !== 'production') {
      console.error('[OpenAI] Error response:', errorData);
    }
    const error: any = new Error(errorData.error?.message || 'OpenAI API error');
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };
    
    // 429 에러 처리
    if (response.status === 429 && retryCount < 3) {
      const rateLimitInfo = parseRateLimitError(error);
      
      if (rateLimitInfo.isRateLimit) {
        apiKeyManager.handleRateLimitError('openai', apiKey, rateLimitInfo.resetTime, rateLimitInfo.rateLimitType);
        
        const nextKey = apiKeyManager.getAvailableKey('openai');
        if (nextKey && nextKey !== apiKey) {
          return executeOpenAIRequest(model, messages, nextKey, userAttachments, persona, retryCount + 1, languageInstruction, streaming, maxOutputTokens);
        }
        
        const availability = apiKeyManager.getNextAvailableTime('openai');
        throw new Error('[ERR_RATE_01] OpenAI rate limit');
      }
    }
    
    throw error;
  }

  // 스트리밍 모드: OpenAI response body를 반환 (POST 핸들러에서 ReadableStream으로 감싸서 즉시 반환)
  if (streaming && !isCodex && response.body) {
    return response;
  }

  // 비스트리밍 JSON 응답 처리 (Codex, 이미지 등)
  const data = await response.json();
  
  // choices 배열 확인
  if (!data?.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    console.error('[OpenAI] No choices in response');
    throw new Error('[ERR_RESP_01] OpenAI empty choices');
  }

  const choice = data.choices[0];
  
  // Check for refusal response (GPT-4o and above)
  if (choice.message?.refusal) {
    console.warn('[OpenAI] Request refused:', choice.message.refusal);
    throw new Error('[ERR_SAFE_01] Content policy violation');
  }
  
  // Handle Codex (Responses API) vs Chat Completions API
  const content = isCodex
    ? (data?.output?.[0]?.content?.[0]?.text || choice.message?.content)
    : choice.message?.content;

  if (!content || (typeof content === 'string' && !content.trim())) {
    console.error('[OpenAI] Empty content. Has choices:', !!data.choices, 'Has message:', !!choice.message);
    throw new Error('[ERR_EMPTY_01] OpenAI empty response');
  }

  return content;
}

// Google AI Studio (Gemini) 호출 (비스트리밍 JSON - Netlify 호환)
async function callGemini(model: string, messages: any[], userAttachments?: UserAttachment[], retryCount: number = 0, temperature?: number, maxOutputTokens?: number): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('gemini');
  if (!apiKey) {
    throw new Error('[ERR_KEY_02] Gemini API key not configured.');
  }

  const geminiModelMap: { [key: string]: string } = {
    // Gemini 2.0 실험 모델 (최신)
    'gemini3': 'gemini-2.0-flash-exp',
    'gemini3pro': 'gemini-2.0-flash-thinking-exp-1219',
    // 레거시 매핑
    'gemini-flash': 'gemini-1.5-flash',
    'gemini-pro': 'gemini-1.5-pro',
  };

  const selectedModel = geminiModelMap[model] || 'gemini-2.0-flash-exp';

  // Gemini contents 변환
  const contents: Array<{ role: string; parts: any[] }> = [];
  const append = (role: 'user' | 'model', part: any) => {
    if (contents.length === 0 || contents[contents.length - 1].role !== role) {
      contents.push({ role, parts: [part] });
    } else {
      contents[contents.length - 1].parts.push(part);
    }
  };

  // 기존 대화 변환 (assistant -> model)
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p?.type === 'text' && p?.text) {
          append(role, { text: p.text });
        } else if (p?.type === 'image_url' && p?.image_url?.url) {
          const parsed = extractBase64(p.image_url.url);
          if (parsed) {
            append(role, { inline_data: { mime_type: parsed.mime, data: parsed.base64 } });
          }
        }
      }
    } else if (typeof m.content === 'string') {
      append(role, { text: m.content });
    }
  }

  // 마지막 user 메시지에 첨부 추가
  if (userAttachments?.length) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        for (const att of userAttachments) {
          if (att.type === 'image' && att.dataUrl) {
            const parsed = extractBase64(att.dataUrl);
            if (parsed) contents[i].parts.push({ inline_data: { mime_type: parsed.mime, data: parsed.base64 } });
          } else if (att.type === 'text' && att.content) {
            contents[i].parts.push({ text: `File (${att.name}):\n${att.content.slice(0, 4000)}` });
          }
        }
        break;
      }
    }
  }

  // generateContent 엔드포인트 사용 (비스트리밍 - Netlify 호환)
  let response: Response;
  try {
    response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { 
          temperature: temperature ?? 0.9,
          maxOutputTokens: maxOutputTokens ?? 2048,
          topP: 0.95,
          topK: 40
        },
      }),
    }, {
      timeout: DEFAULT_API_TIMEOUT_MS,
      maxRetries: DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError') {
      throw new Error('MODEL_RESPONSE_TIMEOUT');
    }
    throw new Error(`[ERR_NET_02] Gemini connection failed`);
  }

  if (!response.ok) {
    let data: any = {};
    try { data = await response.json(); } catch { /* ignore */ }
    const msg = data?.error?.message || 'Gemini API error';
    const error: any = new Error(msg);
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };
    
    // 429 에러 처리
    if (response.status === 429 && retryCount < 3) {
      const rateLimitInfo = parseRateLimitError(error);
      
      if (rateLimitInfo.isRateLimit) {
        apiKeyManager.handleRateLimitError('gemini', apiKey, rateLimitInfo.resetTime, rateLimitInfo.rateLimitType);
        
        const nextKey = apiKeyManager.getAvailableKey('gemini');
        if (nextKey && nextKey !== apiKey) {
          return callGemini(model, messages, userAttachments, retryCount + 1, temperature, maxOutputTokens);
        }
        
        const availability = apiKeyManager.getNextAvailableTime('gemini');
        throw new Error('[ERR_RATE_02] Gemini rate limit');
      }
    }
    
    throw error;
  }

  // 비스트리밍 JSON 응답 처리
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const content = parts.map((p: any) => p?.text).filter(Boolean).join('');

  if (!content || !content.trim()) {
    throw new Error('[ERR_EMPTY_02] Gemini empty response');
  }

  return content;
}

// Anthropic API 호출 (비스트리밍 JSON - Netlify 완벽 호환)
async function callAnthropic(model: string, messages: any[], userAttachments?: UserAttachment[], retryCount: number = 0, temperature?: number, maxOutputTokens?: number): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('anthropic');
  
  if (!apiKey) {
    throw new Error('[ERR_KEY_03] Anthropic API key not configured.');
  }

  const modelMap: { [key: string]: string } = {
    // Claude 3.5 시리즈 (실제 출시)
    'haiku35':  'claude-3-5-haiku-20241022',
    'sonnet35': 'claude-3-5-sonnet-20241022',
    // Claude 4.5 시리즈 (실제 출시)
    'haiku45':  'claude-haiku-4-5',
    'sonnet45': 'claude-sonnet-4-5',
    'opus45':   'claude-opus-4-5',
    // Claude 4.6 시리즈 (실제 출시)
    'sonnet46': 'claude-sonnet-4-6',
    'opus46':   'claude-opus-4-6',
    // Claude Opus 4 (실제 출시)
    'opus4':    'claude-opus-4-20250514',
    // 레거시 매핑
    'claude-haiku':  'claude-3-haiku-20240307',
    'claude-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-opus':   'claude-3-opus-20240229',
  };

  // Anthropic 형식으로 변환 (system 메시지 분리)
  const systemMessage = messages.find((m: any) => m.role === 'system');
  const conversationMessages = messages.filter((m: any) => m.role !== 'system');

  // Transform to Anthropic content blocks; add image/text attachments to the LAST user message
  const transformed = conversationMessages.map((m: any) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
      : [{ type: 'text', text: typeof m.content === 'string' ? m.content : '' }]
  }));

  if (userAttachments?.length) {
    for (let i = transformed.length - 1; i >= 0; i--) {
      if (transformed[i].role === 'user') {
        userAttachments.forEach(att => {
          if (att.type === 'image' && att.dataUrl) {
            const parsed = extractBase64(att.dataUrl);
            if (parsed) {
              transformed[i].content.push({
                type: 'image',
                source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 }
              } as any);
            }
          } else if (att.type === 'text' && att.content) {
            transformed[i].content.push({ type: 'text', text: `File (${att.name}):\n${att.content.slice(0, 4000)}` });
          }
        });
        break;
      }
    }
  }

  // 모델별 max_tokens 설정
  let maxTokens = 1500; // Sonnet 기본값
  if (model.includes('haiku')) {
    maxTokens = 1000; // Haiku
  } else if (model.includes('opus')) {
    maxTokens = 2000; // Opus
  }
  if (typeof maxOutputTokens === 'number') {
    maxTokens = Math.min(maxTokens, maxOutputTokens);
  }
  
  let response: Response;
  try {
    response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelMap[model] || 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        temperature: temperature ?? 1.0,
        system: systemMessage?.content || 'You are a helpful AI assistant.',
        messages: transformed
      })
    }, {
      timeout: DEFAULT_API_TIMEOUT_MS,
      maxRetries: DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError') {
      throw new Error('MODEL_RESPONSE_TIMEOUT');
    }
    throw new Error(`[ERR_NET_03] Anthropic connection failed`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: any = new Error(errorData.error?.message || 'Anthropic API error');
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };
    
    // 429 에러 처리
    if (response.status === 429 && retryCount < 3) {
      const rateLimitInfo = parseRateLimitError(error);
      
      if (rateLimitInfo.isRateLimit) {
        apiKeyManager.handleRateLimitError('anthropic', apiKey, rateLimitInfo.resetTime, rateLimitInfo.rateLimitType);
        
        const nextKey = apiKeyManager.getAvailableKey('anthropic');
        if (nextKey && nextKey !== apiKey) {
          return callAnthropic(model, messages, userAttachments, retryCount + 1, temperature, maxOutputTokens);
        }
        
        const availability = apiKeyManager.getNextAvailableTime('anthropic');
        throw new Error('[ERR_RATE_03] Anthropic rate limit');
      }
    }
    
    throw error;
  }

  // 비스트리밍 JSON 응답 처리
  const data = await response.json();
  const content = data?.content?.map((c: any) => c.type === 'text' ? c.text : '').filter(Boolean).join('') || '';

  if (!content || !content.trim()) {
    throw new Error('[ERR_EMPTY_03] Anthropic empty response');
  }

  return content;
}

// Perplexity API 호출 (비스트리밍 JSON - Netlify 완벽 호환)
async function callPerplexity(model: string, messages: any[], userAttachments?: UserAttachment[], retryCount: number = 0, temperature?: number, maxOutputTokens?: number): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('perplexity');
  
  if (!apiKey) {
    throw new Error('[ERR_KEY_04] Perplexity API key not configured.');
  }

  const modelMap: { [key: string]: string } = {
    'sonar': 'sonar',
    'sonarPro': 'sonar-pro',
    'deepResearch': 'sonar-deep-research',
    'perplexity-sonar': 'sonar',
    'perplexity-sonar-pro': 'sonar-pro',
    'perplexity-deep-research': 'sonar-deep-research'
  };
  const cappedMaxTokens = typeof maxOutputTokens === 'number' ? Math.min(800, maxOutputTokens) : 800;

  // 첨부파일 메모 추가
  let finalMessages = messages;
  if (userAttachments?.length) {
    finalMessages = [...messages];
    const lastUserIdx = finalMessages.map((m: any) => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
      const last = finalMessages[lastUserIdx];
      finalMessages[lastUserIdx] = {
        ...last,
        content: `${last.content || ''}\n\n[${userAttachments.length} attachments not supported by this model]`
      };
    }
  }

  let response: Response;
  try {
    response = await fetchWithRetry('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelMap[model] || 'sonar',
        stream: false,
        messages: finalMessages,
        max_tokens: cappedMaxTokens,
        temperature: temperature ?? 0.9,
        top_p: 0.9,
      })
    }, {
      timeout: DEFAULT_API_TIMEOUT_MS,
      maxRetries: DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError') {
      throw new Error('MODEL_RESPONSE_TIMEOUT');
    }
    throw new Error(`[ERR_NET_04] Perplexity connection failed`);
  }

  if (!response.ok) {
    let errorData: any = {};
    try { errorData = await response.json(); } catch {}
    const error: any = new Error(errorData.error?.message || `Perplexity API error (${response.status})`);
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };

    if (response.status === 429 && retryCount < 3) {
      const rateLimitInfo = parseRateLimitError(error);
      if (rateLimitInfo.isRateLimit) {
        apiKeyManager.handleRateLimitError('perplexity', apiKey, rateLimitInfo.resetTime, rateLimitInfo.rateLimitType);
        const nextKey = apiKeyManager.getAvailableKey('perplexity');
        if (nextKey && nextKey !== apiKey) {
          return callPerplexity(model, messages, userAttachments, retryCount + 1, temperature, maxOutputTokens);
        }
        const availability = apiKeyManager.getNextAvailableTime('perplexity');
        throw new Error('[ERR_RATE_04] Perplexity rate limit');
      }
    }

    throw error;
  }

  // 비스트리밍 JSON 응답 처리
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content || !content.trim()) {
    throw new Error('[ERR_EMPTY_04] Perplexity empty response');
  }

  return content;
}

// xAI Grok 영상 생성 API 호출
async function callGrokVideo(prompt: string, durationSeconds: number): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('xai');
  if (!apiKey) throw new Error('[ERR_KEY_05] xAI API key not configured.');

  const response = await fetchWithRetry('https://api.x.ai/v1/video/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt,
      n: 1,
      duration: durationSeconds,
    }),
  }, {
    timeout: Math.max(DEFAULT_API_TIMEOUT_MS, 120000),
    maxRetries: 0,
    retryDelay: DEFAULT_RETRY_DELAY_MS,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`[ERR_GROK_VID_${response.status}] Grok video error: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const url = data?.data?.[0]?.url;
  const b64 = data?.data?.[0]?.b64_json;
  if (url) return `__VIDEO__:${url}`;
  if (b64) return `__VIDEO__:data:video/mp4;base64,${b64}`;
  throw new Error('[ERR_EMPTY_GROK_VID] Grok video empty response');
}

// xAI Grok 텍스트 API 호출
async function callGrok(modelId: string, messages: any[], userAttachments?: UserAttachment[], retryCount: number = 0, temperature?: number, maxOutputTokens?: number): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('xai');
  if (!apiKey) {
    throw new Error('[ERR_KEY_05] xAI API key not configured.');
  }

  const modelMap: Record<string, string> = {
    'grok3mini':      'grok-3-mini',
    'grok3':          'grok-3',
    'grok4fastNR':    'grok-4-fast-non-reasoning',
    'grok4fastR':     'grok-4-fast-reasoning',
    'grok41fastNR':   'grok-4-1-fast-non-reasoning',
    'grok41fastR':    'grok-4-1-fast-reasoning',
    'grok40709':      'grok-4-0709',
    'grokCodeFast1':  'grok-code-fast-1',
  };

  const xaiModel = modelMap[modelId] || 'grok-3-mini';

  // 첨부파일: 이미지 지원 (grok-3 이상)
  let finalMessages = messages;
  if (userAttachments?.length) {
    finalMessages = messages.map((m: any, idx: number) => {
      if (m.role !== 'user' || idx !== messages.length - 1) return m;
      const parts: any[] = [];
      if (typeof m.content === 'string') parts.push({ type: 'text', text: m.content });
      for (const att of userAttachments) {
        if (att.type === 'image' && att.dataUrl) {
          const parsed = extractBase64(att.dataUrl);
          if (parsed) {
            parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
          }
        } else if (att.type === 'text' && att.content) {
          parts.push({ type: 'text', text: `\n[File: ${att.name}]\n${att.content}` });
        }
      }
      return { ...m, content: parts.length > 0 ? parts : m.content };
    });
  }

  let response: Response;
  try {
    response = await fetchWithRetry('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: xaiModel,
        messages: finalMessages,
        max_tokens: typeof maxOutputTokens === 'number' ? Math.min(2000, maxOutputTokens) : 2000,
        temperature: temperature ?? 0.7,
        stream: false,
      }),
    }, {
      timeout: DEFAULT_API_TIMEOUT_MS,
      maxRetries: DEFAULT_API_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
    });
  } catch (error: any) {
    throw error;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 429 && retryCount < 3) {
      const rateLimitInfo = parseRateLimitError({ status: 429, message: JSON.stringify(error) });
      if (rateLimitInfo.isRateLimit) {
        apiKeyManager.handleRateLimitError('xai', apiKey, rateLimitInfo.resetTime, rateLimitInfo.rateLimitType);
        const nextKey = apiKeyManager.getAvailableKey('xai');
        if (nextKey && nextKey !== apiKey) {
          return callGrok(modelId, messages, userAttachments, retryCount + 1, temperature, maxOutputTokens);
        }
      }
    }
    throw new Error(`[ERR_XAI_${response.status}] xAI API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error('[ERR_EMPTY_05] xAI empty response');
  }
  return content;
}

// xAI Grok 이미지 생성 API 호출
async function callGrokImage(modelId: string, prompt: string): Promise<string> {
  const apiKey = apiKeyManager.getAvailableKey('xai');
  if (!apiKey) {
    throw new Error('[ERR_KEY_05] xAI API key not configured.');
  }

  const modelMap: Record<string, string> = {
    'grokImagine':  'grok-imagine-image',
    'grok2image':   'grok-2-image-1212',
  };
  const xaiModel = modelMap[modelId] || 'grok-imagine-image';

  const response = await fetchWithRetry('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: xaiModel,
      prompt,
      n: 1,
      response_format: 'url',
    }),
  }, {
    timeout: DEFAULT_API_TIMEOUT_MS,
    maxRetries: DEFAULT_API_RETRIES,
    retryDelay: DEFAULT_RETRY_DELAY_MS,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`[ERR_XAI_IMG_${response.status}] xAI image error: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('[ERR_EMPTY_05] xAI image empty response');

  return `![생성된 이미지](${url})`;
}

export async function POST(request: NextRequest) {
  if (isStaticExportPhase) {
    return NextResponse.json(
      { error: 'Chat API unavailable in static export.' },
      {
        status: 501,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  const session = await verifySession(request);
  if (!session.authenticated || !session.userId) {
    return NextResponse.json({ error: 'ERR_AUTH', reason: '로그인이 필요합니다.' }, { status: 401 });
  }

  let chargedModelId = '';
  let chargedVideoSeconds = 0;
  try {
    // Rate Limiting 체크
    const clientIp = getClientIp(request);
    const rateLimitResult = chatRateLimiter.check(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Try again later.',
          retryAfter: Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
            'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString()
          }
        }
      );
    }

    let requestBody: any;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'ERR_REQ_00', reason: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { modelId, messages, userAttachments, persona, language, temperature, storedFacts, conversationSummary, speechLevel, videoSeconds, chainMaxOutputTokens } = requestBody ?? {};
    const normalizedChainMaxOutputTokens = normalizeMaxOutputTokens(chainMaxOutputTokens);
    const normalizedTemperature = normalizeTemperature(temperature);

    const resolvedLanguage = (language === 'en' || language === 'ja' || language === 'ko') ? language : 'ko';
    const speechStyle = speechLevel === 'informal'
      ? (resolvedLanguage === 'ko' ? ' Use casual/informal speech (반말).' : ' Use casual tone.')
      : (resolvedLanguage === 'ko' ? ' Use polite/formal speech (존댓말).' : ' Use polite tone.');
    const languageInstruction = (resolvedLanguage === 'en'
      ? 'Always respond in English.'
      : resolvedLanguage === 'ja'
      ? '必ず日本語で回答してください。'
      : '반드시 한국어로 답변해주세요.') + speechStyle;
    const minimumVisibleAnswerRule = resolvedLanguage === 'en'
      ? 'The visible answer before any hidden summary or memory block must be at least 5 separate lines.'
      : resolvedLanguage === 'ja'
      ? '非表示の要約やメモリブロックの前にある可視回答は、必ず5行以上で書いてください。'
      : '숨겨진 요약이나 메모리 블록 전에 보이는 답변은 반드시 5줄 이상으로 작성해주세요.';

    const normalizeStoredFact = (fact: unknown) => {
      if (typeof fact !== 'string') return '';
      const cleaned = fact.trim().replace(/\s+/g, ' ');
      return cleaned.slice(0, 200);
    };

    const storedFactsList: string[] = Array.isArray(storedFacts)
      ? Array.from(new Set(storedFacts.map(normalizeStoredFact).filter(Boolean))).slice(0, 50)
      : [];

    const storedFactsContext = storedFactsList.length
      ? ['[Stored user facts (reference only, do not output)]', ...storedFactsList].join('\n')
      : '';

    const memoryInstruction = [
      'Follow these rules:',
      '1) Output answer first, then add hidden memory block at end only.',
      '2) Memory format (no quotes/code/markdown):',
      '@@MEM@@',
      '<new generalizable user facts, one per line>',
      '@@END@@',
      '3) If no new facts, output empty block:',
      '@@MEM@@',
      '@@END@@',
      '4) No greetings/jokes/emotions/tone/emoji prefs/repetition/guesses/sensitive/PII in memory.',
      '5) Memory: concise, max 120 chars/line, same language as answer.',
    ].join('\n');

    const languageInstructionWithMemory = [languageInstruction, minimumVisibleAnswerRule, storedFactsContext, memoryInstruction]
      .filter(Boolean)
      .join('\n\n');

    // 기본 프롬프트 (모델별 분기)
    const summaryRuleForOthers = '\nEnd every reply with hidden summary in ~~ markers:\n~~\nQ:(10-word summary)\nA:(15-word summary)\nKey:(facts/names/numbers)\n~~';

    const isPerplexityModel = PERPLEXITY_MODEL_IDS.has(modelId) || modelId.startsWith('perplexity');
    const isClaudeModel = ANTHROPIC_MODEL_IDS.has(modelId) || modelId.startsWith('claude');

    const perplexityBasePrompt = `Answer format rules:
Start with a direct 1-2 sentence answer. Never open with a header or meta-commentary.
Use ## headers only when organizing substantial multi-section content.
Lists: one item per line, no indentation. Single newline between list items, double newline between paragraphs.
Keep paragraphs short (2-3 sentences max).${summaryRuleForOthers}`;

    const claudeBasePrompt = `Response style rules:
Write in readable, flowing prose that guides the reader naturally.
Never output a series of overly short bullet points or fragment information into isolated points.
Use minimum formatting—prefer prose over excessive markdown. Match the user's prompt style.${summaryRuleForOthers}`;

    const defaultBasePrompt = `Best friend AI. Rules: wild reactions, 3+ emojis, ALL CAPS hype, casual texting tone, never formal, short punchy sentences.
Example style:
"OMG WAIT 🔥🔥🔥 bro that's INSANE!! okay okay let me break it down 👇
💡 [answer]
🎯 [key point]
😤 honestly you're gonna CRUSH this!!"${summaryRuleForOthers}`;

    const basePrompt = isPerplexityModel
      ? perplexityBasePrompt
      : isClaudeModel
      ? claudeBasePrompt
      : defaultBasePrompt;

    const applyLanguageInstruction = (inputMessages: any[]) => {
      const idx = inputMessages.findIndex((m: any) => m?.role === 'system');
      
      // 요약이 있으면 오래된 메시지를 요약으로 대체하되, 최근 6개는 그대로 유지
      let contextMessages = inputMessages;
      if (conversationSummary && inputMessages.length > 7) {
        const recentMessages = inputMessages.slice(-6);
        contextMessages = [
          {
            role: 'system',
            content: `Previous conversation summary:\n${conversationSummary}`
          },
          ...recentMessages
        ];
      }
      
      const systemContent = [basePrompt, languageInstructionWithMemory].filter(Boolean).join('\n\n');
      
      if (idx === -1) {
        return [{ role: 'system', content: systemContent }, ...contextMessages];
      }
      
      const existing = contextMessages[idx];
      const existingContent = typeof existing?.content === 'string' ? existing.content : '';
      const merged = [existingContent, systemContent].filter(Boolean).join('\n\n');
      
      return [
        ...contextMessages.slice(0, idx),
        { ...existing, content: merged },
        ...contextMessages.slice(idx + 1),
      ];
    };

    // 입력 검증
    if (typeof modelId !== 'string' || !modelId.trim() || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'ERR_REQ_00', reason: 'Invalid request.' },
        { status: 400 }
      );
    }

    // 메시지 길이 제한 (DoS 방지)
    if (messages.length > 100) {
      return NextResponse.json(
        { error: 'Too many messages.' },
        { status: 400 }
      );
    }

    // 각 메시지 내용 길이 제한 + 비정상 role 차단
    for (const msg of messages) {
      if (!msg || !['user', 'assistant', 'system'].includes(msg.role)) {
        return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid message role.' }, { status: 400 });
      }
      if (typeof msg.content === 'string') {
        if (msg.content.length > 50000) {
          return NextResponse.json(
            { error: 'ERR_REQ_00', reason: 'Message too long.' },
            { status: 400 }
          );
        }
      } else if (Array.isArray(msg.content)) {
        if (msg.content.length > 24) {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Message content is too complex.' }, { status: 400 });
        }
        const isValidContentArray = msg.content.every((part: any) => {
          if (!part || typeof part !== 'object') return false;
          if (part.type === 'text') return typeof part.text === 'string' && part.text.length <= 50000;
          if (part.type === 'image_url') return typeof part.image_url?.url === 'string' && part.image_url.url.length <= 10 * 1024 * 1024;
          return false;
        });
        if (!isValidContentArray) {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid message content format.' }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid message content type.' }, { status: 400 });
      }
    }

    // 마지막 사용자 메시지 검증 (고의 에러 방지)
    const lastUserMsg = findLastMessageByRole(messages, 'user');
    if (!lastUserMsg) {
      return NextResponse.json({ error: 'ERR_REQ_00', reason: 'No user message found.' }, { status: 400 });
    }
    if (lastUserMsg) {
      const content = typeof lastUserMsg.content === 'string' ? lastUserMsg.content.trim() : '';
      // 빈 메시지 차단
      if (!hasMeaningfulMessageContent(lastUserMsg.content)) {
        return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Empty message.' }, { status: 400 });
      }
      // 반복 문자 스팸 차단 (같은 문자가 200자 이상 반복)
      if (content.length > 200) {
        const uniqueChars = new Set(content.replace(/\s/g, '')).size;
        if (uniqueChars <= 2) {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Spam message detected.' }, { status: 400 });
        }
      }
    }

    // 첨부파일 크기 제한
    if (userAttachments && Array.isArray(userAttachments)) {
      if (userAttachments.length > 10) {
        return NextResponse.json(
          { error: 'ERR_REQ_00', reason: 'Too many attachments.' },
          { status: 400 }
        );
      }
      
      for (const attachment of userAttachments) {
        if (!attachment || !['image', 'text'].includes(attachment.type) || typeof attachment.name !== 'string' || !attachment.name.trim()) {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid attachment.' }, { status: 400 });
        }
        if (attachment.type === 'image' && typeof attachment.dataUrl !== 'string') {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid image attachment.' }, { status: 400 });
        }
        if (attachment.type === 'text' && typeof attachment.content !== 'string') {
          return NextResponse.json({ error: 'ERR_REQ_00', reason: 'Invalid text attachment.' }, { status: 400 });
        }
        if (attachment.dataUrl && attachment.dataUrl.length > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'ERR_REQ_00', reason: 'Attachment too large (max 10MB).' },
            { status: 400 }
          );
        }
      }
    }

    // ── 비즈니스 로직 함정: 메시지 내 공격 페이로드 탐지 ──
    const lastContent = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
    const PROMPT_INJECTION_PATTERNS = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /disregard\s+(all\s+)?(your\s+)?(rules|instructions|guidelines)/i,
      /you\s+are\s+now\s+(a|an|DAN|jailbroken|evil)/i,
      /\bDAN\s+(mode|prompt)\b/i,
      /system\s*:\s*(you|ignore|forget|override)/i,
      /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/,
      /reveal\s+(your|the)\s+(system|initial|original)\s+prompt/i,
      /repeat\s+(the|your)\s+(system|initial)\s+(message|prompt)/i,
    ];
    const isPromptInjection = PROMPT_INJECTION_PATTERNS.some(p => p.test(lastContent));
    if (isPromptInjection) {
      console.warn('[chat] Prompt injection attempt:', {
        userId: session.userId, modelId,
        snippet: lastContent.slice(0, 200),
        ip: getClientIp(request),
      });
    }

    // ── Layer 20: Shadow 모드 분기 ─────────────────────────────
    // 실제 AI 호출 및 크레딧 차감 없이 합성 응답 반환.
    // isShadowedAny는 인메모리 기반 (단일 인스턴스 신뢰 가능).
    if (isShadowedAny(session.userId)) {
      const shadowSeed = getShadowSeedForUser(session.userId);
      const lastMsg = findLastMessageByRole(messages, 'user');
      const userText = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
      const syntheticReply = generateSyntheticAiResponse(shadowSeed, userText);
      const delayMs = Math.min(getSyntheticResponseDelay(shadowSeed), 1500);
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
      return new Response(buildPseudoStream(syntheticReply), { headers: PSEUDO_STREAM_HEADERS });
    }

    // 영상 모델: 보유 초 검증 후 초 단위 차감 (일반 모델보다 먼저 처리)
    if (GROK_VIDEO_IDS.has(modelId)) {
      const duration = Math.max(1, Math.min(50, Number(videoSeconds) || 5));
      const videoConsumed = await consumeVideoCredits(session.userId, modelId, duration);
      if (!videoConsumed) {
        return NextResponse.json({ error: 'ERR_CREDIT_00', reason: '영상 생성 크레딧(초)이 부족합니다.' }, { status: 402 });
      }
      chargedModelId = modelId;
      chargedVideoSeconds = duration;
      const userMsg = findLastMessageByRole(messages, 'user');
      const prompt = typeof userMsg?.content === 'string' ? userMsg.content : (userMsg?.content?.[0]?.text || '');
      const videoResult = await callGrokVideo(prompt, duration);
      return NextResponse.json({ content: videoResult });
    }

    const creditConsumed = await consumeChatCredit(session.userId, modelId);
    if (!creditConsumed) {
      return NextResponse.json({ error: 'ERR_CREDIT_00', reason: '사용 가능한 크레딧이 없습니다.' }, { status: 402 });
    }
    chargedModelId = modelId;

    // 디버그 모드에서만 요청 추적
    if (DEBUG_LOGS) {
      console.log('[Chat API] Request:', { modelId, messages: messages.length });
    }

    // 모델 제공사 판별
    const isGrokModel = GROK_TEXT_IDS.has(modelId) || GROK_IMAGE_IDS.has(modelId) || GROK_VIDEO_IDS.has(modelId);

    const isOpenAIModel = !isGrokModel && (
      modelId.startsWith('gpt')
      || IMAGE_MODEL_IDS.has(modelId)
      || modelId === 'o3' || modelId === 'o3mini' || modelId === 'o4mini'
    );

    // GPT 스트리밍 가능 모델 (이미지 제외)
    const isStreamableGPT = isOpenAIModel && !IMAGE_MODEL_IDS.has(modelId);

    // GPT 스트리밍 모델: TransformStream으로 감싸서 반환
    // 스트림 중간 오류 감지 시 서버에서 크레딧 환불 처리
    if (isStreamableGPT && OPENAI_STREAMING_ALLOWED) {
      const openaiRes = await callOpenAI(modelId, messages, userAttachments, persona, languageInstructionWithMemory, true, normalizedChainMaxOutputTokens) as Response;
      if (!openaiRes.body) {
        throw new Error('OpenAI response has no body');
      }

      const capturedUserId = session.userId;
      const capturedModelId = modelId;
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      // 스트림을 파이프하면서 오류 발생 시 크레딧 자동 환불
      (async () => {
        const reader = openaiRes.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
          await writer.close();
        } catch {
          await writer.abort(new Error('Stream interrupted'));
          try {
            await refundChatCredit(capturedUserId, capturedModelId);
          } catch {}
        }
      })();

      return new Response(readable, { headers: OPENAI_STREAM_HEADERS });
    }

    // Grok 이미지 생성 모델: JSON 응답
    if (GROK_IMAGE_IDS.has(modelId)) {
      const userMsg = findLastMessageByRole(messages, 'user');
      const prompt = typeof userMsg?.content === 'string' ? userMsg.content : (userMsg?.content?.[0]?.text || '');
      const imageContent = await callGrokImage(modelId, prompt);
      return NextResponse.json({ content: imageContent });
    }

    // 텍스트 AI는 pseudo-streaming SSE로 응답 (체감 속도 극대화)
    const isPseudoStreamable =
      modelId.startsWith('gemini') ||
      modelId.startsWith('claude') ||
      ANTHROPIC_MODEL_IDS.has(modelId) ||
      modelId.startsWith('perplexity') ||
      PERPLEXITY_MODEL_IDS.has(modelId) ||
      GROK_TEXT_IDS.has(modelId);
    const instructedMessages = isPseudoStreamable ? applyLanguageInstruction(messages) : messages;

    if (isPseudoStreamable) {
      let responseContent: string;
      if (modelId.startsWith('gemini')) {
        responseContent = await callGemini(modelId, instructedMessages, userAttachments, 0, normalizedTemperature, normalizedChainMaxOutputTokens);
      } else if (modelId.startsWith('claude') || ANTHROPIC_MODEL_IDS.has(modelId)) {
        responseContent = await callAnthropic(modelId, instructedMessages, userAttachments, 0, normalizedTemperature, normalizedChainMaxOutputTokens);
      } else if (GROK_TEXT_IDS.has(modelId)) {
        responseContent = await callGrok(modelId, instructedMessages, userAttachments, 0, normalizedTemperature, normalizedChainMaxOutputTokens);
      } else {
        responseContent = await callPerplexity(modelId, instructedMessages, userAttachments, 0, normalizedTemperature, normalizedChainMaxOutputTokens);
      }

      return new Response(buildPseudoStream(responseContent), {
        headers: PSEUDO_STREAM_HEADERS,
      });
    }

    // 이미지/Codex 등 나머지 모델은 JSON 응답
    let responseContent: string;

    if (isOpenAIModel) {
      responseContent = await callOpenAI(modelId, messages, userAttachments, persona, languageInstructionWithMemory, false, normalizedChainMaxOutputTokens) as string;
    } else {
      if (DEBUG_LOGS) {
        console.log('[Chat API] Unknown model, using demo response:', modelId);
      }
      responseContent = `[${modelId}] ${resolvedLanguage === 'ja' ? 'こんにちは！質問にお答えします。' : resolvedLanguage === 'en' ? 'Hello! I will answer your question.' : '안녕하세요! 질문에 답변드리겠습니다.'} (Demo mode: Add API key to .env.local)`;
    }

    return NextResponse.json({ content: responseContent });

  } catch (error: any) {
    if (session.userId && chargedModelId) {
      try {
        if (chargedVideoSeconds > 0) {
          await refundVideoCredits(session.userId, chargedModelId, chargedVideoSeconds);
        } else {
          await refundChatCredit(session.userId, chargedModelId);
        }
      } catch {}
    }
    // 모든 환경에서 에러 로깅 (디버깅용)
    console.error('[Chat API] Error caught:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // 스택 일부만
      timestamp: new Date().toISOString()
    });

    // API 키가 없는 경우 데모 응답
    if (error.message?.includes('key not configured')) {
      return NextResponse.json({ 
        content: `Demo mode: Add API keys to .env.local\n\n` +
                 `Setup:\n` +
                 `1. Create .env.local in project root\n` +
                 `2. Add:\n` +
                 `   - OPENAI_API_KEY=your_key (GPT)\n` +
                 `   - ANTHROPIC_API_KEY=your_key (Claude)\n` +
                 `   - PERPLEXITY_API_KEY=your_key (Perplexity)\n\n` +
                 `See env.example for details.`
      });
    }

    const { code, reason, status } = normalizeRouteError(error);

    if (code === 'ERR_TIMEOUT') {
      console.error('[Chat API] Timeout error');
    }

    return NextResponse.json(
      { error: code, reason },
      { status }
    );
  }
}

function extractErrorCodeFromMessage(message: string): string | undefined {
  return message.match(/\[(ERR_[A-Z0-9_]+)\]/)?.[1] || message.match(/\b(ERR_[A-Z0-9_]+)\b/)?.[1];
}

function normalizeRouteErrorCode(rawCode: string | undefined, message: string, status?: number): string {
  if (message === 'MODEL_RESPONSE_TIMEOUT') {
    return 'ERR_TIMEOUT';
  }

  if (rawCode) {
    const providerStatusMatch = rawCode.match(/^ERR_(?:GROK_VID|XAI(?:_IMG)?)_(\d{3})$/);
    if (providerStatusMatch) {
      const providerStatus = Number(providerStatusMatch[1]);
      if (providerStatus === 401 || providerStatus === 403) return 'ERR_AUTH';
      if (providerStatus === 429) return 'ERR_RATE_05';
      if (providerStatus >= 500) return 'ERR_NET_05';
      return 'ERR_RESP_05';
    }

    if (rawCode === 'ERR_EMPTY_GROK_VID') {
      return 'ERR_EMPTY_05';
    }

    if (rawCode === 'ERR_STREAM') {
      return 'ERR_RESP_00';
    }

    return rawCode;
  }

  if (message.includes('safety') || message.includes('content policy') || message.includes('not allowed') || message.includes('Unsupported')) {
    return 'ERR_SAFE_02';
  }

  if (message.includes('mapping not configured') || message.includes('not configured') || message.includes('Check .env.local')) {
    return 'ERR_CONFIG_01';
  }

  if (status === 429 || message.includes('rate limit')) {
    return 'ERR_RATE';
  }

  if (status === 401 || status === 403) {
    return 'ERR_AUTH';
  }

  if (message.toLowerCase().includes('timeout')) {
    return 'ERR_TIMEOUT';
  }

  return 'ERR_UNKNOWN';
}

function getStatusCodeFromErrorCode(code: string, fallbackStatus?: number): number {
  if (code === 'ERR_TIMEOUT') return 504;
  if (code.startsWith('ERR_KEY') || code === 'ERR_AUTH') return fallbackStatus === 403 ? 403 : 401;
  if (code.startsWith('ERR_RATE')) return 429;
  if (code.startsWith('ERR_NET')) return 503;
  if (code.startsWith('ERR_EMPTY') || code.startsWith('ERR_RESP')) return 502;
  if (code.startsWith('ERR_SAFE')) return 451;
  if (code.startsWith('ERR_CONFIG')) return 500;
  if (fallbackStatus && fallbackStatus >= 400 && fallbackStatus < 600) return fallbackStatus;
  return 500;
}

function getClientSafeErrorReason(message: string, normalizedCode: string): string | undefined {
  const cleaned = message
    .replace(/\[(ERR_[A-Z0-9_]+)\]\s*/g, '')
    .replace(/\bERR_[A-Z0-9_]+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned === normalizedCode || cleaned === 'MODEL_RESPONSE_TIMEOUT') {
    return undefined;
  }

  return cleaned.slice(0, 280);
}

function normalizeRouteError(error: any): { code: string; reason: string | undefined; status: number } {
  const errMsg = error.message || '';
  const extractedCode = extractErrorCodeFromMessage(errMsg);
  const errorCode = normalizeRouteErrorCode(extractedCode, errMsg, error.status);
  const statusCode = getStatusCodeFromErrorCode(errorCode, error.status);
  const reason = getClientSafeErrorReason(errMsg, errorCode);

  return { code: errorCode, reason, status: statusCode };
}
