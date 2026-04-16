/**
 * API 키 로테이션 및 Rate Limit 관리 시스템
 * 고급 큐 시스템 및 429 에러 방지 기능 포함
 * 보안 강화: 키 검증, 마스킹, 암호화 지원
 */

import { validateApiKey, maskApiKey, securityLog } from './security';

interface ApiKeyStatus {
  key: string;
  isAvailable: boolean;
  rateLimitResetTime?: number; // Unix timestamp
  rateLimitType?: 'minute' | 'day';
  lastError?: string;
  lastUsedTime?: number; // 마지막 사용 시간
  requestCount?: number; // 분당 요청 수
  requestCountResetTime?: number; // 요청 카운트 리셋 시간
  activeRequests?: number; // 현재 진행 중인 요청 수
}

interface QueuedRequest {
  id: string;
  provider: string;
  priority: number;
  createdAt: number;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface ApiKeyPool {
  openai: ApiKeyStatus[];
  anthropic: ApiKeyStatus[];
  gemini: ApiKeyStatus[];
  perplexity: ApiKeyStatus[];
  xai: ApiKeyStatus[];
}

class ApiKeyRotationManager {
  private keyPools: ApiKeyPool = {
    openai: [],
    anthropic: [],
    gemini: [],
    perplexity: [],
    xai: [],
  };

  // 설정 값 (서버리스 환경용 - 큐 시스템 제거됨)
  private readonly MIN_REQUEST_INTERVAL = 150; // ms - 요청 간 최소 간격
  private readonly MAX_CONCURRENT_REQUESTS_PER_KEY = 3; // 키당 최대 동시 요청
  private readonly MAX_REQUESTS_PER_MINUTE = 50; // 분당 최대 요청 수

  constructor() {
    this.initializeKeyPools();
  }

  /**
   * 환경 변수에서 API 키 풀 초기화
   */
  private initializeKeyPools(): void {
    // OpenAI 키 (OPENAI_API_KEY_1, OPENAI_API_KEY_2, OPENAI_API_KEY_3)
    let openaiKeyCount = 0;
    for (let i = 1; i <= 3; i++) {
      const key = process.env[`OPENAI_API_KEY_${i}`] || (i === 1 ? process.env.OPENAI_API_KEY : '');
      if (key) {
        // API 키 유효성 검증
        if (!validateApiKey(key, 'openai')) {
          securityLog('warn', `OpenAI API 키 ${i} 형식이 올바르지 않습니다`, { keyMask: maskApiKey(key) });
          continue;
        }
        this.keyPools.openai.push({
          key,
          isAvailable: true,
        });
        openaiKeyCount++;
        securityLog('info', `OpenAI API 키 ${i} 로드 완료`, { keyMask: maskApiKey(key) });
      }
    }
    
    if (openaiKeyCount === 0 && process.env.NODE_ENV !== 'production') {
      console.error('[API Key Manager] No OpenAI API keys found');
    }

    // Anthropic 키
    for (let i = 1; i <= 3; i++) {
      const key = process.env[`ANTHROPIC_API_KEY_${i}`] || (i === 1 ? process.env.ANTHROPIC_API_KEY : '');
      if (key) {
        if (!validateApiKey(key, 'anthropic')) {
          securityLog('warn', `Anthropic API 키 ${i} 형식이 올바르지 않습니다`, { keyMask: maskApiKey(key) });
          continue;
        }
        this.keyPools.anthropic.push({
          key,
          isAvailable: true,
        });
        securityLog('info', `Anthropic API 키 ${i} 로드 완료`, { keyMask: maskApiKey(key) });
      }
    }

    // Gemini 키
    for (let i = 1; i <= 3; i++) {
      const key = process.env[`GOOGLE_API_KEY_${i}`] || (i === 1 ? process.env.GOOGLE_API_KEY : '');
      if (key) {
        if (!validateApiKey(key, 'google')) {
          securityLog('warn', `Google API 키 ${i} 형식이 올바르지 않습니다`, { keyMask: maskApiKey(key) });
          continue;
        }
        this.keyPools.gemini.push({
          key,
          isAvailable: true,
        });
        securityLog('info', `Google API 키 ${i} 로드 완료`, { keyMask: maskApiKey(key) });
      }
    }

    // Perplexity 키
    for (let i = 1; i <= 3; i++) {
      const key = process.env[`PERPLEXITY_API_KEY_${i}`] || (i === 1 ? process.env.PERPLEXITY_API_KEY : '');
      if (key) {
        if (!validateApiKey(key, 'perplexity')) {
          securityLog('warn', `Perplexity API 키 ${i} 형식이 올바르지 않습니다`, { keyMask: maskApiKey(key) });
          continue;
        }
        this.keyPools.perplexity.push({
          key,
          isAvailable: true,
        });
        securityLog('info', `Perplexity API 키 ${i} 로드 완료`, { keyMask: maskApiKey(key) });
      }
    }

    // xAI (Grok) 키
    for (let i = 1; i <= 3; i++) {
      const key = process.env[`XAI_API_KEY_${i}`] || (i === 1 ? process.env.XAI_API_KEY : '');
      if (key) {
        if (!validateApiKey(key, 'xai')) {
          securityLog('warn', `xAI API 키 ${i} 형식이 올바르지 않습니다`, { keyMask: maskApiKey(key) });
          continue;
        }
        this.keyPools.xai.push({
          key,
          isAvailable: true,
        });
        securityLog('info', `xAI API 키 ${i} 로드 완료`, { keyMask: maskApiKey(key) });
      }
    }
  }

  /**
   * 사용 가능한 API 키 가져오기
   */
  getAvailableKey(provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai'): string | null {
    const pool = this.keyPools[provider];
    
    if (!pool || pool.length === 0) {
      return null;
    }

    const now = Date.now();

    // 1. 사용 가능한 키 찾기
    const availableKey = pool.find(k => k.isAvailable && (!k.rateLimitResetTime || k.rateLimitResetTime <= now));
    if (availableKey) {
      return availableKey.key;
    }

    // 2. 모든 키가 제한된 경우, 가장 빨리 풀리는 키 찾기
    const soonestKey = pool
      .filter(k => k.rateLimitResetTime)
      .sort((a, b) => (a.rateLimitResetTime || 0) - (b.rateLimitResetTime || 0))[0];

    if (soonestKey && soonestKey.rateLimitResetTime && soonestKey.rateLimitResetTime <= now) {
      // 제한이 풀렸으면 다시 사용 가능으로 설정
      soonestKey.isAvailable = true;
      soonestKey.rateLimitResetTime = undefined;
      return soonestKey.key;
    }

    // 3. 모든 키가 제한 중이면 가장 빨리 풀리는 키 반환 (에러 메시지용)
    return soonestKey ? soonestKey.key : pool[0].key;
  }

  /**
   * Rate Limit 에러 처리
   */
  handleRateLimitError(
    provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai',
    apiKey: string,
    resetTime?: number,
    rateLimitType?: 'minute' | 'day'
  ): void {
    const pool = this.keyPools[provider];
    const keyStatus = pool.find(k => k.key === apiKey);

    if (keyStatus) {
      keyStatus.isAvailable = false;
      keyStatus.rateLimitResetTime = resetTime || this.calculateResetTime(rateLimitType);
      keyStatus.rateLimitType = rateLimitType;
      keyStatus.lastError = `Rate limit exceeded (${rateLimitType || 'unknown'})`;
    }
  }

  /**
   * Reset 시간 계산
   */
  private calculateResetTime(rateLimitType?: 'minute' | 'day'): number {
    const now = Date.now();
    
    if (rateLimitType === 'minute') {
      // 1분 후
      return now + 60 * 1000;
    } else if (rateLimitType === 'day') {
      // 내일 자정 (UTC 기준)
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      return tomorrow.getTime();
    }
    
    // 기본값: 1분 후
    return now + 60 * 1000;
  }

  /**
   * 다음 사용 가능 시간 가져오기
   */
  getNextAvailableTime(provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai'): {
    available: boolean;
    resetTime?: number;
    waitSeconds?: number;
    message?: string;
  } {
    const pool = this.keyPools[provider];
    const now = Date.now();

    // 사용 가능한 키가 있는지 확인
    const hasAvailable = pool.some(k => k.isAvailable && (!k.rateLimitResetTime || k.rateLimitResetTime <= now));
    
    if (hasAvailable) {
      return { available: true };
    }

    // 가장 빨리 풀리는 키 찾기
    const soonestKey = pool
      .filter(k => k.rateLimitResetTime)
      .sort((a, b) => (a.rateLimitResetTime || 0) - (b.rateLimitResetTime || 0))[0];

    if (!soonestKey || !soonestKey.rateLimitResetTime) {
      return { 
        available: false, 
        message: 'API 키를 사용할 수 없습니다.' 
      };
    }

    const waitSeconds = Math.ceil((soonestKey.rateLimitResetTime - now) / 1000);
    const rateLimitType = soonestKey.rateLimitType;

    let message = '';
    if (rateLimitType === 'minute') {
      message = `분당 요청 한도를 초과했습니다. 1분 후에 다시 시도해주세요.`;
    } else if (rateLimitType === 'day') {
      message = `일일 요청 한도를 초과했습니다. 내일 다시 시도해주세요.`;
    } else {
      message = `요청 한도를 초과했습니다. ${Math.ceil(waitSeconds / 60)}분 후에 다시 시도해주세요.`;
    }

    return {
      available: false,
      resetTime: soonestKey.rateLimitResetTime,
      waitSeconds,
      message,
    };
  }

  /**
   * 키 상태 초기화 (테스트용)
   */
  resetKeyStatus(provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai', apiKey: string): void {
    const pool = this.keyPools[provider];
    const keyStatus = pool.find(k => k.key === apiKey);

    if (keyStatus) {
      keyStatus.isAvailable = true;
      keyStatus.rateLimitResetTime = undefined;
      keyStatus.rateLimitType = undefined;
      keyStatus.lastError = undefined;
    }
  }

  /**
   * 모든 키 상태 조회 (디버깅용)
   */
  getKeyPoolStatus(provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai'): ApiKeyStatus[] {
    return this.keyPools[provider].map(k => ({
      key: k.key.substring(0, 10) + '...',
      isAvailable: k.isAvailable,
      rateLimitResetTime: k.rateLimitResetTime,
      rateLimitType: k.rateLimitType,
      lastError: k.lastError,
    }));
  }

  /**
   * 요청 즉시 실행 (서버리스 환경용)
   */
  async enqueueRequest<T>(
    provider: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'xai',
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return await execute();
  }




}

// 싱글톤 인스턴스
export const apiKeyManager = new ApiKeyRotationManager();

/**
 * Rate Limit 에러 파싱
 */
export function parseRateLimitError(error: any): {
  isRateLimit: boolean;
  resetTime?: number;
  rateLimitType?: 'minute' | 'day';
} {
  const errorMessage = error?.message || error?.toString() || '';
  const errorStatus = error?.status || error?.response?.status;

  // 429 에러 확인
  if (errorStatus !== 429 && !errorMessage.includes('rate limit') && !errorMessage.includes('429')) {
    return { isRateLimit: false };
  }

  // Reset 시간 추출 (헤더에서)
  let resetTime: number | undefined;
  const resetHeader = error?.response?.headers?.['x-ratelimit-reset'];
  if (resetHeader) {
    resetTime = parseInt(resetHeader) * 1000; // Unix timestamp to milliseconds
  }

  // Rate Limit 타입 추정
  let rateLimitType: 'minute' | 'day' | undefined;
  
  if (errorMessage.includes('minute') || errorMessage.includes('분당')) {
    rateLimitType = 'minute';
    resetTime = resetTime || Date.now() + 60 * 1000;
  } else if (errorMessage.includes('day') || errorMessage.includes('daily') || errorMessage.includes('일일') || errorMessage.includes('내일')) {
    rateLimitType = 'day';
    if (!resetTime) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);
      resetTime = tomorrow.getTime();
    }
  } else {
    // 기본값: 분당 제한으로 간주
    rateLimitType = 'minute';
    resetTime = resetTime || Date.now() + 60 * 1000;
  }

  return {
    isRateLimit: true,
    resetTime,
    rateLimitType,
  };
}
