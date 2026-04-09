import { NextResponse } from 'next/server';
import { getAdminSecretPath } from '@/lib/serverSecurity';

export async function GET() {
  const adminPath = getAdminSecretPath();
  if (!adminPath) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }
  return NextResponse.json({ adminPath });
}
