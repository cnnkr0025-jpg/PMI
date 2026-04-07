/**
 * MFA 통합 관리 모듈
 * - TOTP (RFC 6238) — Google Authenticator 호환
 * - Recovery codes (SHA-256 해시 저장, 1회용)
 * - WebAuthn/Passkey 기반 틀 (@simplewebauthn/server 연동 준비)
 * - 저장소: Supabase admin_mfa 테이블
 */

import crypto from 'crypto';
import { generateTotpSecret, verifyTotp, generateTotpUri } from './totp';
import { encrypt, decrypt } from './encryption';
import { supabaseAdmin } from './supabaseAdmin';
import { sendSecurityAlert } from './alerting';
import { audit } from './auditLog';

export const MFA_ADMIN_ID = 'admin';

// ── Recovery Codes ──
const RECOVERY_COUNT = 8;
const RECOVERY_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외

function genRawCode(): string {
  const buf = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += RECOVERY_CHARSET[buf[i] % RECOVERY_CHARSET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function hashCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.replace(/-/g, '').toUpperCase())
    .digest('hex');
}

export function generateRecoveryCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    const c = genRawCode();
    plain.push(c);
    hashed.push(hashCode(c));
  }
  return { plain, hashed };
}

function verifyRecoveryCodeAgainst(input: string, hashedCodes: string[]): number {
  const hash = hashCode(input);
  const hashBuf = Buffer.from(hash, 'hex');
  for (let i = 0; i < hashedCodes.length; i++) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(hashedCodes[i], 'hex'), hashBuf)) return i;
    } catch { /* 길이 불일치 */ }
  }
  return -1;
}

// ── DB 타입 ──
export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: string;
  deviceName?: string;
}

export interface AdminMfaRow {
  admin_id: string;
  totp_enabled: boolean;
  totp_secret_enc?: string | null;
  recovery_codes_hashed: string[];
  webauthn_credentials: WebAuthnCredential[];
  setup_completed_at?: string | null;
}

// ── 상태 조회 ──
export async function getMfaState(adminId = MFA_ADMIN_ID): Promise<AdminMfaRow | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_mfa')
      .select('*')
      .eq('admin_id', adminId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data as AdminMfaRow | null;
  } catch {
    return null;
  }
}

export async function isMfaEnabled(adminId = MFA_ADMIN_ID): Promise<boolean> {
  const state = await getMfaState(adminId);
  return state?.totp_enabled === true || (state?.webauthn_credentials?.length ?? 0) > 0;
}

// ── TOTP 설정 ──
export async function initTotpSetup(adminId = MFA_ADMIN_ID): Promise<{
  secret: string;
  uri: string;
}> {
  const secret = generateTotpSecret();
  const encryptedSecret = encrypt(secret);

  await supabaseAdmin.from('admin_mfa').upsert(
    {
      admin_id: adminId,
      totp_secret_enc: encryptedSecret,
      totp_enabled: false,
    },
    { onConflict: 'admin_id' }
  );

  return {
    secret,
    uri: generateTotpUri({
      secret,
      label: `PickMyAI Admin:${adminId}`,
      issuer: 'PickMyAI',
    }),
  };
}

export async function confirmTotpSetup(
  code: string,
  adminId = MFA_ADMIN_ID,
): Promise<{ success: boolean; recoveryCodes?: string[]; error?: string }> {
  const state = await getMfaState(adminId);
  if (!state?.totp_secret_enc) {
    return { success: false, error: 'TOTP 설정이 시작되지 않았습니다.' };
  }

  let secret: string;
  try {
    secret = decrypt(state.totp_secret_enc);
  } catch {
    return { success: false, error: '시크릿 복호화 실패. ENCRYPTION_KEY를 확인하세요.' };
  }

  if (!verifyTotp(secret, code)) {
    return { success: false, error: '인증 코드가 올바르지 않습니다.' };
  }

  const { plain, hashed } = generateRecoveryCodes();

  await supabaseAdmin
    .from('admin_mfa')
    .update({
      totp_enabled: true,
      recovery_codes_hashed: hashed,
      setup_completed_at: new Date().toISOString(),
    })
    .eq('admin_id', adminId);

  audit({
    event_type: 'ADMIN_ACTION',
    severity: 'info',
    user_id: adminId,
    details: { action: 'mfa_totp_enabled' },
  });

  return { success: true, recoveryCodes: plain };
}

// ── MFA 검증 (로그인 2단계) ──
export async function verifyMfaCode(
  code: string,
  adminId = MFA_ADMIN_ID,
  ip?: string,
): Promise<{ valid: boolean; method?: 'totp' | 'recovery'; error?: string }> {
  const state = await getMfaState(adminId);
  if (!state?.totp_enabled) return { valid: true }; // MFA 미설정 시 통과

  // TOTP 검증 (6자리 숫자)
  if (/^\d{6}$/.test(code)) {
    if (!state.totp_secret_enc) return { valid: false, error: 'MFA 설정 오류' };
    let secret: string;
    try { secret = decrypt(state.totp_secret_enc); } catch {
      return { valid: false, error: 'MFA 설정 오류' };
    }
    if (verifyTotp(secret, code)) {
      audit({ event_type: 'AUTH_LOGIN', severity: 'info', user_id: adminId, ip, details: { method: 'totp' } });
      return { valid: true, method: 'totp' };
    }
    audit({ event_type: 'AUTH_FAILURE', severity: 'warn', user_id: adminId, ip, details: { method: 'totp' } });
    return { valid: false, error: '인증 코드가 올바르지 않습니다.' };
  }

  // Recovery code 검증 (XXXX-XXXX 형식)
  const cleanCode = code.trim().toUpperCase().replace(/\s/g, '');
  if (/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) {
    const idx = verifyRecoveryCodeAgainst(cleanCode, state.recovery_codes_hashed || []);
    if (idx !== -1) {
      const remaining = state.recovery_codes_hashed.filter((_, i) => i !== idx);
      await supabaseAdmin
        .from('admin_mfa')
        .update({ recovery_codes_hashed: remaining })
        .eq('admin_id', adminId);

      sendSecurityAlert({
        title: '관리자 Recovery Code 사용',
        message: `Recovery code가 사용되었습니다. 잔여: ${remaining.length}개`,
        severity: remaining.length === 0 ? 'critical' : 'warn',
        fields: { AdminID: adminId, ...(ip ? { IP: ip } : {}), RemainingCodes: String(remaining.length) },
      });
      audit({ event_type: 'AUTH_LOGIN', severity: 'warn', user_id: adminId, ip, details: { method: 'recovery', remaining: remaining.length } });
      return { valid: true, method: 'recovery' };
    }
    return { valid: false, error: '복구 코드가 올바르지 않습니다.' };
  }

  return { valid: false, error: '코드 형식이 올바르지 않습니다 (6자리 숫자 또는 XXXX-XXXX).' };
}

// ── MFA 비활성화 ──
export async function disableMfa(adminId = MFA_ADMIN_ID): Promise<void> {
  await supabaseAdmin
    .from('admin_mfa')
    .update({
      totp_enabled: false,
      totp_secret_enc: null,
      recovery_codes_hashed: [],
      webauthn_credentials: [],
      setup_completed_at: null,
    })
    .eq('admin_id', adminId);

  sendSecurityAlert({
    title: '관리자 MFA 비활성화',
    message: `관리자 MFA가 비활성화되었습니다.`,
    severity: 'critical',
    fields: { AdminID: adminId },
  });
}

// ── WebAuthn Credential 관리 (등록) ──
export async function addWebAuthnCredential(
  adminId = MFA_ADMIN_ID,
  credential: Omit<WebAuthnCredential, 'createdAt'>,
): Promise<void> {
  const state = await getMfaState(adminId);
  const existing: WebAuthnCredential[] = state?.webauthn_credentials || [];

  const newCred: WebAuthnCredential = { ...credential, createdAt: new Date().toISOString() };
  await supabaseAdmin
    .from('admin_mfa')
    .upsert(
      { admin_id: adminId, webauthn_credentials: [...existing, newCred] },
      { onConflict: 'admin_id' }
    );
}

export async function getWebAuthnCredentials(adminId = MFA_ADMIN_ID): Promise<WebAuthnCredential[]> {
  const state = await getMfaState(adminId);
  return state?.webauthn_credentials || [];
}

export async function updateWebAuthnCounter(
  adminId = MFA_ADMIN_ID,
  credentialId: string,
  newCounter: number,
): Promise<void> {
  const state = await getMfaState(adminId);
  const creds = (state?.webauthn_credentials || []).map((c) =>
    c.id === credentialId ? { ...c, counter: newCounter } : c
  );
  await supabaseAdmin
    .from('admin_mfa')
    .update({ webauthn_credentials: creds })
    .eq('admin_id', adminId);
}

// ── Recovery codes 재생성 ──
export async function regenerateRecoveryCodes(
  adminId = MFA_ADMIN_ID,
): Promise<string[]> {
  const { plain, hashed } = generateRecoveryCodes();
  await supabaseAdmin
    .from('admin_mfa')
    .update({ recovery_codes_hashed: hashed })
    .eq('admin_id', adminId);

  sendSecurityAlert({
    title: '관리자 Recovery Codes 재생성',
    message: 'Recovery codes가 재생성되었습니다.',
    severity: 'warn',
    fields: { AdminID: adminId },
  });
  return plain;
}
