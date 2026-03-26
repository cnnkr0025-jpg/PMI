/**
 * API 에러 응답 통합 유틸리티
 *
 * 규칙:
 * - 클라이언트에는 항상 { error: string, code?: string } 만 반환
 * - 내부 에러 메시지(DB/업스트림 원문)는 절대 노출하지 않음
 * - 프로덕션에서는 서버 로그만 상세 기록, 개발 환경에서는 콘솔에 출력
 */

import { NextResponse } from 'next/server';

const isProd = process.env.NODE_ENV === 'production';

/** 안전하게 에러를 서버 로그에만 기록 */
export function logError(context: string, error: unknown): void {
  if (!isProd) {
    console.error(`[${context}]`, error);
  } else {
    // 프로덕션: 스택 없이 메시지만 (민감 정보 노출 최소화)
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] ${msg}`);
  }
}

/** 표준 에러 응답 생성 */
export function apiError(
  message: string,
  status: number,
  code?: string
): NextResponse {
  const body: Record<string, string> = { error: message };
  if (code) body.code = code;
  return NextResponse.json(body, { status });
}

/** 공통 에러 코드 */
export const ERR = {
  AUTH:        (msg = '인증이 필요합니다.')            => apiError(msg, 401, 'ERR_AUTH'),
  FORBIDDEN:   (msg = '권한이 없습니다.')              => apiError(msg, 403, 'ERR_FORBIDDEN'),
  BAD_REQUEST: (msg = '요청 형식이 올바르지 않습니다.') => apiError(msg, 400, 'ERR_BAD_REQUEST'),
  NOT_FOUND:   (msg = '리소스를 찾을 수 없습니다.')     => apiError(msg, 404, 'ERR_NOT_FOUND'),
  RATE_LIMIT:  (msg = '요청이 너무 많습니다.')          => apiError(msg, 429, 'ERR_RATE_LIMIT'),
  SERVER:      (msg = '서버 오류가 발생했습니다.')       => apiError(msg, 500, 'ERR_SERVER'),
  UNAVAILABLE: (msg = '서비스를 일시적으로 사용할 수 없습니다.') => apiError(msg, 503, 'ERR_UNAVAILABLE'),
} as const;

/**
 * try/catch 블록의 catch 절에서 사용 — 내부 에러를 안전하게 처리
 * 상황에 맞는 공개 메시지를 내려주고, 원인은 서버 로그에만 남김
 */
export function handleUnexpectedError(context: string, error: unknown): NextResponse {
  logError(context, error);
  return ERR.SERVER();
}

/**
 * JSON 파싱 유틸: 비정상 body → null 반환 (예외 전파 없음)
 */
export async function safeJson<T = unknown>(
  request: Request
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
