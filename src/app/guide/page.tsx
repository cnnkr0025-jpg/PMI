import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: '사용 가이드 | Pick-My-AI',
  description:
    'Pick-My-AI 사용 방법, 크레딧·결제, AI 모델 안내, 설정 및 문제 해결 가이드입니다.',
};

function GuideSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900" aria-busy="true" aria-label="가이드 로딩 중">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3 animate-pulse">
        <div className="mb-8 space-y-2">
          <div className="h-9 w-48 max-w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-full max-w-md rounded bg-gray-100 dark:bg-gray-800" />
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
          />
        ))}
      </div>
    </div>
  );
}

const GuideClient = dynamic(() => import('./GuideClient'), {
  loading: () => <GuideSkeleton />,
  ssr: false,
});

export default function GuidePage() {
  return <GuideClient />;
}
