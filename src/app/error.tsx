'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 개발: 상세 정보, 프로덕션: digest(지원 참조 코드)만 로그
    if (process.env.NODE_ENV !== 'production') {
      console.error('[GlobalError]', error);
    } else if (error.digest) {
      console.error('[GlobalError] digest:', error.digest);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">500</h1>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          서버 오류가 발생했어요
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
          일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        {/* digest: 지원팀 문의 시 제공할 참조 코드 */}
        {error.digest && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 font-mono">
            참조 코드: {error.digest}
          </p>
        )}
        {!error.digest && <div className="mb-6" />}
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
