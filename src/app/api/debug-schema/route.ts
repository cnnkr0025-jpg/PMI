import { NextResponse } from 'next/server';

// 보안 강화: 디버그 엔드포인트는 프로덕션에서 완전 비활성화
// 어떤 환경에서도 DB 스키마 노출 및 INSERT 테스트를 허용하지 않음
export async function GET() {
  return NextResponse.json({ error: '비활성화된 엔드포인트입니다.' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: '비활성화된 엔드포인트입니다.' }, { status: 404 });
}
