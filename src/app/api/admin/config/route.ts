import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSecretPath } from '@/lib/serverSecurity';

export async function GET(request: NextRequest) {
  const adminPath = getAdminSecretPath();
  if (!adminPath) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }
  if (adminPath === 'admin') {
    return NextResponse.json({ error: 'ADMIN_SECRET_PATH must be changed from default "admin"' }, { status: 403 });
  }
  const key = request.nextUrl.searchParams.get('key') || '';
  if (!key) {
    return NextResponse.json({ configured: true, valid: false, isStatic: false });
  }
  const keyBuf = Buffer.from(key);
  const pathBuf = Buffer.from(adminPath);
  const valid = keyBuf.length === pathBuf.length && crypto.timingSafeEqual(keyBuf, pathBuf);
  return NextResponse.json({ configured: true, valid, isStatic: false });
}
