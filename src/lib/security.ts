// Edge Runtime 호환: Web Crypto API 사용
// Note: 암호화 기능은 서버 사이드에서만 사용 가능

import { encrypt, decrypt, isEncrypted } from './encryption';

/**
 * API 키 암호화 (AES-256-GCM)
 */
export function encryptApiKey(apiKey: string): string {
  if (!apiKey) return '';
  try {
    if (!process.env.ENCRYPTION_KEY) return apiKey;
    return encrypt(apiKey);
  } catch {
    return apiKey;
  }
}

/**
 * API 키 복호화 (AES-256-GCM)
 */
export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return '';
  try {
    if (isEncrypted(encryptedKey)) return decrypt(encryptedKey);
    return encryptedKey;
  } catch {
    return encryptedKey;
  }
}

/**
 * API 키 마스킹 (로그용)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return '***';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

/**
 * API 키 유효성 검증
 */
export function validateApiKey(apiKey: string, provider: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') return false;
  
  // 기본 길이 체크만 수행 (형식 검증 완화)
  if (apiKey.length < 10) return false;
  
  // 프로바이더별 기본 접두사만 확인
  const prefixes: Record<string, string> = {
    openai: 'sk-',
    anthropic: 'sk-ant-',
    google: 'AIza',
    perplexity: 'pplx-',
    grok: 'xai-',
  };
  
  const prefix = prefixes[provider];
  if (prefix) {
    return apiKey.startsWith(prefix);
  }
  
  return true; // 알 수 없는 프로바이더는 통과
}

/**
 * 환경 변수 보안 검증
 */
export function validateEnvironmentSecurity(): {
  isSecure: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // 프로덕션 환경 체크
  if (process.env.NODE_ENV === 'production') {
    // 암호화 키 확인
    if (!process.env.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY가 설정되지 않았습니다.');
    } else if (process.env.ENCRYPTION_KEY.length < 64) {
      errors.push('ENCRYPTION_KEY는 최소 64자 이상이어야 합니다.');
    }
    
    // HTTPS 확인
    if (!process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')) {
      warnings.push('프로덕션 환경에서는 HTTPS를 사용해야 합니다.');
    }
    
    // 콘솔 로그 비활성화 확인
    if (process.env.NEXT_PUBLIC_ENABLE_CONSOLE !== 'false') {
      warnings.push('프로덕션에서 콘솔 로그를 비활성화하세요.');
    }
  }
  
  // API 키 검증
  const providers = ['openai', 'anthropic', 'google', 'perplexity'];
  providers.forEach(provider => {
    for (let i = 1; i <= 3; i++) {
      const keyName = `${provider.toUpperCase()}_API_KEY_${i}`;
      const key = process.env[keyName];
      
      if (key && !validateApiKey(key, provider)) {
        warnings.push(`${keyName}의 형식이 올바르지 않습니다.`);
      }
    }
  });
  
  return {
    isSecure: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * IP 주소 검증 및 차단 리스트 체크
 */
const blockedIPs = new Set<string>();
const suspiciousIPs = new Map<string, { count: number; lastSeen: number }>();

export function checkIPSecurity(ip: string): {
  allowed: boolean;
  reason?: string;
} {
  // 차단된 IP 확인
  if (blockedIPs.has(ip)) {
    return { allowed: false, reason: 'IP가 차단되었습니다.' };
  }
  
  // 의심스러운 활동 체크
  const suspicious = suspiciousIPs.get(ip);
  if (suspicious) {
    const timeSinceLastSeen = Date.now() - suspicious.lastSeen;
    
    // 1분 내 100회 이상 요청 시 차단
    if (suspicious.count > 100 && timeSinceLastSeen < 60000) {
      blockedIPs.add(ip);
      return { allowed: false, reason: '비정상적인 요청 패턴이 감지되었습니다.' };
    }
    
    // 10분 지나면 카운트 리셋
    if (timeSinceLastSeen > 600000) {
      suspiciousIPs.delete(ip);
    }
  }
  
  return { allowed: true };
}

/**
 * IP 활동 기록
 */
export function recordIPActivity(ip: string): void {
  const current = suspiciousIPs.get(ip) || { count: 0, lastSeen: Date.now() };
  suspiciousIPs.set(ip, {
    count: current.count + 1,
    lastSeen: Date.now(),
  });
}

/**
 * 요청 헤더 보안 검증
 */
export function validateRequestHeaders(headers: Headers): {
  valid: boolean;
  reason?: string;
} {
  // User-Agent 확인
  const userAgent = headers.get('user-agent');
  if (!userAgent) {
    return { valid: false, reason: 'User-Agent 헤더가 없습니다.' };
  }
  
  // 의심스러운 User-Agent 패턴
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    return { valid: false, reason: '의심스러운 User-Agent가 감지되었습니다.' };
  }
  
  // Origin 확인 (프로덕션)
  if (process.env.NODE_ENV === 'production') {
    const origin = headers.get('origin');
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL,
      'https://pick-my-ai.com',
      'https://pickmyai.store',
      'https://www.pickmyai.store',
    ].filter(Boolean);
    
    if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed || ''))) {
      return { valid: false, reason: '허용되지 않은 Origin입니다.' };
    }
  }
  
  return { valid: true };
}

/**
 * API 키 노출 방지 - 응답 데이터 검증
 */
const SENSITIVE_KEY_PATTERNS = [
  'apikey', 'api_key', 'secret', 'password', 'token', 'authorization',
  'cookie', 'session', 'refresh', 'bearer', 'credential', 'private_key',
];

export function sanitizeResponse(data: any): any {
  if (typeof data === 'string') {
    return data
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
      .replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, '[REDACTED]')
      .replace(/AIza[a-zA-Z0-9_-]{35}/g, '[REDACTED]')
      .replace(/pplx-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
      .replace(/xai-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
      .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[JWT_REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item));
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lk = key.toLowerCase();
      if (SENSITIVE_KEY_PATTERNS.some(p => lk.includes(p))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeResponse(value);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * 보안 로깅
 */
export function securityLog(level: 'info' | 'warn' | 'error', message: string, metadata?: any): void {
  if (process.env.NODE_ENV === 'production') {
    const logData = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata: sanitizeResponse(metadata),
    };
    
    // 프로덕션에서는 외부 로깅 서비스로 전송
    // 예: Sentry, LogRocket, CloudWatch 등
    console[level === 'error' ? 'error' : 'log'](JSON.stringify(logData));
  } else {
    console.log(`[SECURITY ${level.toUpperCase()}]`, message, metadata);
  }
}
