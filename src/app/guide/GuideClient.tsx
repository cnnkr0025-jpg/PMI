'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X, ArrowRight, Shield, Gift } from 'lucide-react';
import { initialModels } from '@/data/models';

const SERIES_LABELS: Record<string, string> = {
  gpt: 'OpenAI GPT',
  claude: 'Anthropic Claude',
  gemini: 'Google Gemini',
  perplexity: 'Perplexity',
  grok: 'xAI Grok',
  image: '이미지 생성',
  video: '영상 생성',
  coding: '코딩 특화',
};

export default function GuidePage() {
  const [bannerClosed, setBannerClosed] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, typeof initialModels>();
    for (const m of initialModels) {
      const key = m.series || 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    const ORDER = ['gpt', 'claude', 'gemini', 'perplexity', 'grok', 'coding', 'image', 'video'];
    return ORDER.flatMap(k => map.has(k) ? [{ series: k, models: map.get(k)! }] : []);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* 무료체험 홍보 배너 */}
      {!bannerClosed && (
        <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-white/20">
                <Gift className="w-4 h-4" />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold whitespace-nowrap">지금 가입하면 무료 체험 크레딧 즉시 지급!</span>
                <span className="text-white/80 text-xs whitespace-nowrap hidden sm:inline">
                  회원가입 즉시 자동 지급 · 신용카드 불필요
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-indigo-700 text-xs font-bold rounded-full hover:bg-indigo-50 transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                무료로 시작하기
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setBannerClosed(true)}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                aria-label="배너 닫기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 신뢰 지표 바 */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-6 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Shield className="w-3.5 h-3.5 text-green-500" />
            <span>모든 데이터 암호화 전송·저장</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            <span>외부 데이터 판매 0건</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
            <span>대화 내용 AI 학습 미사용</span>
          </div>
          <Link
            href="/security"
            className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium whitespace-nowrap"
          >
            보안 대시보드 보기 →
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">PMI 2026 가격표</h1>
          <p className="text-gray-500 text-sm">모든 가격은 1회 사용 기준이며 세금 포함입니다.</p>
        </div>

        <div className="space-y-10">
          {groups.map(({ series, models }) => (
            <div key={series}>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 border-b border-gray-200 pb-2">
                {SERIES_LABELS[series] || series}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                      <th className="pb-2 pr-6 font-medium">모델</th>
                      <th className="pb-2 pr-6 font-medium">가격</th>
                      <th className="pb-2 pr-6 font-medium">설명</th>
                      <th className="pb-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {models.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 pr-6 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {m.displayName}
                        </td>
                        <td className="py-3 pr-6 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {series === 'video'
                            ? (m.piWon ? `${m.piWon.toLocaleString()}원/초` : '미정')
                            : (m.piWon ? `${m.piWon.toLocaleString()}원/회` : '미정')}
                        </td>
                        <td className="py-3 pr-6 text-gray-500 dark:text-gray-400 max-w-xs">
                          {typeof m.description === 'string' ? m.description : ''}
                        </td>
                        <td className="py-3">
                          {m.enabled ? (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">사용 가능</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">준비중</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>• 가격은 사전 공지 없이 변경될 수 있습니다.</p>
          <p>• 영상 생성 모델은 프로모션 할인이 적용되지 않습니다.</p>
          <p>• 실제 서비스 이용을 위해서는 회원가입 후 크레딧 구매가 필요합니다.</p>
        </div>
      </div>
    </div>
  );
}
