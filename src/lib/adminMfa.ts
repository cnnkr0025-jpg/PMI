import { SignJWT } from 'jose';

const SECRET_KEY = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || '';

function getPendingKey(): Uint8Array {
  if (!SECRET_KEY || SECRET_KEY.length < 32) throw new Error('JWT 키 미설정');
  return new TextEncoder().encode(`pending:${SECRET_KEY}`);
}

/** 비밀번호 검증 후 MFA 대기 중인 임시 토큰 생성 (3분 유효) */
export async function generateMfaPendingToken(adminPath: string): Promise<string> {
  return new SignJWT({ role: 'mfa-pending', adminPath })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('3m')
    .sign(getPendingKey());
}
