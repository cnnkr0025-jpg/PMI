/**
 * 중앙화된 비밀 관리 모듈
 *
 * 기능:
 *   - 환경변수 기반 시크릿 접근 (단일 진입점)
 *   - 키 만료 임박 경고 (ROTATION_WARNING_DAYS 전부터 알림)
 *   - 키 버전 추적 (현재/이전 키 체계 — 무중단 롤오버)
 *   - 접근 감사 로그 (민감 시크릿 조회 시 기록)
 *   - 시크릿 형식 검증 (로드 시점에 즉시 실패)
 *
 * 프로덕션 권장 업그레이드:
 *   - AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault 연동
 *   - 환경변수 대신 KMS 기반 암호화 키 관리
 *   - IAM 역할별 시크릿 접근 제한
 */

import crypto from 'crypto';
import { sendSecurityAlert } from './alerting';

// ── 키 만료 경고 (일 단위) ──
const ROTATION_WARNING_DAYS = 30;
const MS_PER_DAY = 86_400_000;

// ── 시크릿 메타데이터 정의 ──
interface SecretMeta {
  envKey: string;                         // 환경변수 이름
  minLength?: number;                     // 최소 길이
  pattern?: RegExp;                       // 형식 검증 패턴
  expiryEnvKey?: string;                  // 만료일 환경변수 (ISO 8601)
  sensitive?: boolean;                    // true면 조회 시 감사 로그
  fallbackEnvKey?: string;                // 롤오버용 이전 키 환경변수
}

const SECRET_REGISTRY: Record<string, SecretMeta> = {
  JWT_SECRET: {
    envKey: 'JWT_SECRET',
    minLength: 32,
    expiryEnvKey: 'JWT_SECRET_EXPIRES_AT',
    sensitive: true,
    fallbackEnvKey: 'JWT_SECRET_PREV',
  },
  JWT_RSA_PRIVATE_KEY: {
    envKey: 'JWT_RSA_PRIVATE_KEY',
    pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    sensitive: true,
  },
  JWT_RSA_PUBLIC_KEY: {
    envKey: 'JWT_RSA_PUBLIC_KEY',
    pattern: /-----BEGIN PUBLIC KEY-----/,
  },
  ENCRYPTION_KEY: {
    envKey: 'ENCRYPTION_KEY',
    minLength: 64,          // 64 hex chars = 256 bit
    expiryEnvKey: 'ENCRYPTION_KEY_EXPIRES_AT',
    sensitive: true,
    fallbackEnvKey: 'ENCRYPTION_KEY_PREV',
  },
  ADMIN_PASSWORD: {
    envKey: 'ADMIN_PASSWORD',
    minLength: 12,
    sensitive: true,
    expiryEnvKey: 'ADMIN_PASSWORD_EXPIRES_AT',
  },
  ADMIN_JWT_SECRET: {
    envKey: 'ADMIN_JWT_SECRET',
    minLength: 32,
    sensitive: true,
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    envKey: 'SUPABASE_SERVICE_ROLE_KEY',
    pattern: /^eyJ/,        // JWT 형식
    sensitive: true,
  },
  HMAC_SECRET: {
    envKey: 'HMAC_SECRET',
    minLength: 32,
    sensitive: true,
  },
};

// ── 감사 로그 (경량 인메모리) ──
const accessLog: Array<{ key: string; ts: number; caller?: string }> = [];
const ACCESS_LOG_MAX = 500;

function logAccess(key: string, caller?: string): void {
  if (accessLog.length >= ACCESS_LOG_MAX) accessLog.shift();
  accessLog.push({ key, ts: Date.now(), caller });
}

// ── 시크릿 조회 ──

/** 시크릿 값 조회 (감사 로그 + 만료 확인) */
export function getSecret(name: keyof typeof SECRET_REGISTRY, caller?: string): string | null {
  const meta = SECRET_REGISTRY[name];
  if (!meta) throw new Error(`Unknown secret: ${name}`);

  const value = process.env[meta.envKey];
  if (!value) return null;

  if (meta.sensitive) logAccess(name, caller);

  return value;
}

/** 시크릿 조회 — 없으면 throw */
export function requireSecret(name: keyof typeof SECRET_REGISTRY, caller?: string): string {
  const value = getSecret(name, caller);
  if (!value) throw new Error(`Required secret not configured: ${name} (${SECRET_REGISTRY[name]?.envKey})`);
  return value;
}

/** 이전(롤오버) 시크릿 조회 */
export function getPreviousSecret(name: keyof typeof SECRET_REGISTRY): string | null {
  const meta = SECRET_REGISTRY[name];
  if (!meta?.fallbackEnvKey) return null;
  return process.env[meta.fallbackEnvKey] || null;
}

// ── 형식 검증 ──
export interface SecretValidationResult {
  name: string;
  ok: boolean;
  error?: string;
  expiresInDays?: number;
  needsRotation?: boolean;
}

export function validateSecret(name: keyof typeof SECRET_REGISTRY): SecretValidationResult {
  const meta = SECRET_REGISTRY[name];
  const value = process.env[meta.envKey];

  if (!value) {
    return { name, ok: false, error: `${meta.envKey} 환경변수가 설정되지 않았습니다.` };
  }

  if (meta.minLength && value.length < meta.minLength) {
    return {
      name,
      ok: false,
      error: `${meta.envKey}가 너무 짧습니다 (최소 ${meta.minLength}자, 현재 ${value.length}자).`,
    };
  }

  if (meta.pattern && !meta.pattern.test(value)) {
    return { name, ok: false, error: `${meta.envKey}의 형식이 올바르지 않습니다.` };
  }

  // 만료 확인
  if (meta.expiryEnvKey) {
    const expiryStr = process.env[meta.expiryEnvKey];
    if (expiryStr) {
      const expiryMs = Date.parse(expiryStr);
      if (!isNaN(expiryMs)) {
        const expiresInDays = Math.floor((expiryMs - Date.now()) / MS_PER_DAY);
        if (expiresInDays <= 0) {
          return {
            name,
            ok: false,
            error: `${meta.envKey}가 만료되었습니다 (${expiryStr}).`,
            expiresInDays,
            needsRotation: true,
          };
        }
        if (expiresInDays <= ROTATION_WARNING_DAYS) {
          return {
            name,
            ok: true,
            expiresInDays,
            needsRotation: true,
          };
        }
        return { name, ok: true, expiresInDays };
      }
    }
  }

  return { name, ok: true };
}

// ── 전체 검증 (시작 시 실행) ──
export interface SecretsAuditReport {
  allOk: boolean;
  errors: SecretValidationResult[];
  warnings: SecretValidationResult[];
  rotationNeeded: SecretValidationResult[];
}

export function auditAllSecrets(): SecretsAuditReport {
  const results = Object.keys(SECRET_REGISTRY).map((name) =>
    validateSecret(name as keyof typeof SECRET_REGISTRY)
  );

  const errors = results.filter((r) => !r.ok);
  const warnings = results.filter((r) => r.ok && r.needsRotation);
  const rotationNeeded = results.filter((r) => r.needsRotation);

  const report: SecretsAuditReport = {
    allOk: errors.length === 0,
    errors,
    warnings,
    rotationNeeded,
  };

  // 만료 임박 키 알림
  for (const w of rotationNeeded) {
    const days = w.expiresInDays ?? 0;
    const severity = days <= 7 ? 'critical' : days <= 14 ? 'error' : 'warn';
    sendSecurityAlert({
      title: `시크릿 로테이션 필요: ${w.name}`,
      message: days <= 0
        ? `${w.name}이 만료되었습니다. 즉시 교체가 필요합니다.`
        : `${w.name}이 ${days}일 후 만료됩니다.`,
      severity,
      fields: {
        Secret: w.name,
        ExpiresInDays: String(days),
        EnvKey: SECRET_REGISTRY[w.name as keyof typeof SECRET_REGISTRY]?.envKey ?? '',
      },
    });
  }

  return report;
}

// ── 키 로테이션 가이드 생성 ──
export function generateRotationGuide(name: keyof typeof SECRET_REGISTRY): string {
  const meta = SECRET_REGISTRY[name];
  const lines: string[] = [
    `# ${name} 키 로테이션 가이드`,
    '',
    '## 단계',
    `1. 새 키 생성`,
    `2. 환경변수 ${meta.envKey}에 새 키 설정`,
    ...(meta.fallbackEnvKey
      ? [`3. 이전 키를 ${meta.fallbackEnvKey}에 보관 (무중단 전환용, 24시간 유지 후 제거)`]
      : []),
    ...(meta.expiryEnvKey
      ? [`4. ${meta.expiryEnvKey}를 새 만료일로 업데이트 (ISO 8601, 예: ${new Date(Date.now() + 90 * MS_PER_DAY).toISOString().slice(0, 10)})`]
      : []),
    `5. 서버 재시작`,
    `6. 정상 동작 확인 후 이전 키(${meta.fallbackEnvKey ?? '-'}) 제거`,
    '',
    '## 새 키 생성 명령어',
  ];

  if (name === 'JWT_SECRET' || name === 'HMAC_SECRET' || name === 'ADMIN_JWT_SECRET') {
    lines.push('```bash', 'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"', '```');
  } else if (name === 'ENCRYPTION_KEY') {
    lines.push('```bash', 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"', '```');
  } else if (name === 'JWT_RSA_PRIVATE_KEY') {
    lines.push(
      '```bash',
      '# RSA-2048 키 쌍 생성',
      'openssl genrsa -out private.pem 2048',
      'openssl rsa -in private.pem -pubout -out public.pem',
      '# 환경변수용 한 줄 변환',
      'awk \'NF {sub(/\\r/, ""); printf "%s\\\\n",$0;}\' private.pem',
      '```',
    );
  }

  return lines.join('\n');
}

// ── 접근 로그 조회 (감사용) ──
export function getSecretAccessLog(): typeof accessLog {
  return [...accessLog];
}

// ── 시크릿 마스킹 (로그 출력용) ──
export function maskSecret(value: string): string {
  if (!value || value.length < 8) return '***';
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`;
}

// ── SHA-256 지문 (두 시크릿이 같은지 확인용) ──
export function secretFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

// ── 시작 시 자동 검증 (프로덕션 환경에서 경고/에러 출력) ──
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  const report = auditAllSecrets();
  if (!report.allOk) {
    console.error('[SecretManager] 시크릿 검증 오류:', report.errors.map((e) => e.error));
  }
  if (report.rotationNeeded.length > 0) {
    console.warn('[SecretManager] 로테이션 필요:', report.rotationNeeded.map((r) => r.name));
  }
}
