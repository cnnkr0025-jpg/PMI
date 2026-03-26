import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL('/icon.svg', request.url);
  return NextResponse.redirect(url, 307);
}
