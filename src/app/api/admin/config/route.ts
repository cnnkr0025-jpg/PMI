import { NextRequest, NextResponse } from 'next/server';
import { getAdminSecretPath } from '@/lib/serverSecurity';

export async function GET(request: NextRequest) {
  const adminPath = getAdminSecretPath();
  if (!adminPath) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }
  const key = request.nextUrl.searchParams.get('key') || '';
  const isStatic = adminPath === 'admin';
  const valid = isStatic || (key !== '' && key === adminPath);
  return NextResponse.json({ configured: true, valid, isStatic });
}
