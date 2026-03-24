import { validateEnvironmentSecurity, securityLog } from './security';

/**
 * 환경 변수 검증 및 초기화
 * 애플리케이션 시작 시 한 번 실행
 */
export function validateAndInitializeEnv(): void {
  const validation = validateEnvironmentSecurity();
  
  // 에러가 있으면 애플리케이션 시작 중단
  if (!validation.isSecure) {
    console.error('❌ 환경 변수 보안 검증 실패:');
    validation.errors.forEach(error => {
      console.error(`  - ${error}`);
    });
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('보안 검증 실패로 애플리케이션을 시작할 수 없습니다.');
    }
  }
  
  // 경고 출력
  if (validation.warnings.length > 0) {
    console.warn('환경 변수 보안 경고:');
    validation.warnings.forEach(warning => {
      console.warn(`  - ${warning}`);
    });
  }
  
  // 성공 메시지
  if (validation.isSecure && validation.warnings.length === 0) {
    console.log('✅ 환경 변수 보안 검증 완료');
  }
  
  securityLog('info', '환경 변수 검증 완료', {
    isSecure: validation.isSecure,
    warningCount: validation.warnings.length,
    errorCount: validation.errors.length,
  });
}

/**
 * API 키 존재 여부 확인
 */
export function checkRequiredApiKeys(): {
  hasOpenAI: boolean;
  hasAnthropic: boolean;
  hasGoogle: boolean;
  hasPerplexity: boolean;
} {
  return {
    hasOpenAI: !!(
      process.env.OPENAI_API_KEY_1 ||
      process.env.OPENAI_API_KEY_2 ||
      process.env.OPENAI_API_KEY_3
    ),
    hasAnthropic: !!(
      process.env.ANTHROPIC_API_KEY_1 ||
      process.env.ANTHROPIC_API_KEY_2 ||
      process.env.ANTHROPIC_API_KEY_3
    ),
    hasGoogle: !!(
      process.env.GOOGLE_API_KEY_1 ||
      process.env.GOOGLE_API_KEY_2 ||
      process.env.GOOGLE_API_KEY_3
    ),
    hasPerplexity: !!(
      process.env.PERPLEXITY_API_KEY_1 ||
      process.env.PERPLEXITY_API_KEY_2 ||
      process.env.PERPLEXITY_API_KEY_3
    ),
  };
}

/**
 * 환경 변수 안전하게 가져오기
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (!value && !defaultValue) {
    securityLog('warn', `환경 변수 누락: ${key}`);
  }
  
  return value || defaultValue || '';
}

/**
 * 프로덕션 환경 체크
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 개발 환경 체크
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}
