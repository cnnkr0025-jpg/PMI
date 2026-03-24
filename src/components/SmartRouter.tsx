'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Sparkles, Loader2, Lock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useStore } from '@/store';
import { shallow } from 'zustand/shallow';
import { toast } from 'sonner';

type Props = {
  question: string;
  models: any[];
  speechLevel?: string;
  language?: string;
  compact?: boolean;
  autoAnalyzeToken?: number;
};

export const SmartRouter: React.FC<Props> = ({ question, models, speechLevel, language, compact, autoAnalyzeToken }) => {
  const { smartRouterPurchased, smartRouterFreeUsed, setSmartRouterFreeUsed } = useStore(
    (state) => ({
      smartRouterPurchased: state.smartRouterPurchased,
      smartRouterFreeUsed: state.smartRouterFreeUsed,
      setSmartRouterFreeUsed: state.setSmartRouterFreeUsed,
    }),
    shallow
  );
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const lastAnalyzedKeyRef = useRef<string | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);
  const lastAutoAnalyzeTokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const routerModels = useMemo(
    () => models.map((m) => ({ id: m.id, displayName: m.displayName, description: m.description || '' })),
    [models]
  );
  const normalizedQuestion = useMemo(
    () => question.replace(/\s+/g, ' ').trim().toLowerCase(),
    [question]
  );

  const handleAnalyze = useCallback(async (premium = false) => {
    if (!normalizedQuestion) return;
    const requestKey = `${premium ? 'premium' : 'basic'}:${normalizedQuestion}`;

    if (activeRequestKeyRef.current === requestKey) {
      return;
    }

    if (lastAnalyzedKeyRef.current === requestKey) {
      toast.info('같은 질문은 연속으로 다시 분석할 수 없어요. 질문을 수정한 뒤 다시 시도해주세요.');
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setIsPremium(premium);
    activeRequestKeyRef.current = requestKey;

    // 프리미엄 최초 1회 무료 사용 처리
    if (premium && !smartRouterPurchased && !smartRouterFreeUsed) {
      setSmartRouterFreeUsed(true);
    }

    try {
      const res = await fetch('/api/smart-router', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          models: routerModels,
          speechLevel: speechLevel || 'formal',
          language: language || 'ko',
          premium,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error('분석 실패');
      const data = await res.json();
      setRecommendation(data.recommendation);
      lastAnalyzedKeyRef.current = requestKey;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setRecommendation('분석에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      activeRequestKeyRef.current = null;
      setLoading(false);
    }
  }, [normalizedQuestion, question, routerModels, speechLevel, language, smartRouterPurchased, smartRouterFreeUsed, setSmartRouterFreeUsed]);

  useEffect(() => {
    if (!autoAnalyzeToken || !normalizedQuestion || autoAnalyzeToken === lastAutoAnalyzeTokenRef.current) return;
    lastAutoAnalyzeTokenRef.current = autoAnalyzeToken;
    void handleAnalyze(false);
  }, [autoAnalyzeToken, normalizedQuestion, handleAnalyze]);

  if (!question.trim() || models.length === 0) return null;

  return (
    <div className={cn('rounded-xl border bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200', compact ? 'p-2' : 'p-3')}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleAnalyze(false)}
          disabled={loading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed'
          )}
        >
          {loading && !isPremium ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          질문 분석하기
        </button>

        {smartRouterPurchased || !smartRouterFreeUsed ? (
          <button
            onClick={() => handleAnalyze(true)}
            disabled={loading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {loading && isPremium ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            5위 상세 분석{!smartRouterPurchased && !smartRouterFreeUsed ? ' (최초 1회 무료)' : ''}
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Lock className="w-3 h-3" />5위 분석 (구매페이지 &gt; 기타)
          </span>
        )}
      </div>

      {recommendation && (
        <div className={cn('mt-2 text-sm text-gray-800', isPremium ? 'whitespace-pre-wrap' : '')}>
          <span className="font-semibold text-indigo-600">추천</span>{' '}
          {recommendation}
        </div>
      )}
    </div>
  );
};
