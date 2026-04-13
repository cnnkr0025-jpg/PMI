'use client';

import React, { useState, useCallback } from 'react';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { Sparkles, Clock, Zap, Copy, Check, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export const ModelComparison: React.FC = () => {
  const { 
    models, 
    activeComparison,
    startComparison,
    updateComparisonResponse,
    wallet,
    deductCredit,
    language,
  } = useStore();

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [copied, setCopied] = useState<{ [key: string]: boolean }>({});

  const availableModels = models.filter(m => m.enabled && (wallet?.credits[m.id] || 0) > 0);

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : prev.length < 4 ? [...prev, modelId] : prev
    );
  };

  const handleStartComparison = async () => {
    if (selectedModels.length < 2) {
      toast.error('최소 2개 이상의 모델을 선택해주세요.');
      return;
    }

    if (!prompt.trim()) {
      toast.error('프롬프트를 입력해주세요.');
      return;
    }

    const hasCredits = selectedModels.every(modelId => (wallet?.credits[modelId] || 0) > 0);
    if (!hasCredits) {
      toast.error('선택한 모델의 크레딧이 부족합니다.');
      return;
    }

    setIsComparing(true);
    const sessionId = startComparison(selectedModels, prompt);
    const startTime = Date.now();

    const tasks = selectedModels.map(async (modelId) => {
      try {
        const deducted = await deductCredit(modelId);
        if (!deducted) {
          updateComparisonResponse(sessionId, modelId, {
            content: `${modelId} 크레딧 부족`,
            timestamp: new Date(),
            tokens: 0,
            cost: 0,
            latency: 0,
          });
          return;
        }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: modelId,
            messages: [{ role: 'user', content: prompt }],
            language,
          }),
        });

        let content = '';
        const contentType = response.headers.get('content-type') || '';
        const isEventStream = contentType.includes('text/event-stream');

        if (!response.ok) {
          let errorData: any = null;
          try {
            errorData = await response.json();
          } catch {
            // ignore
          }
          throw new Error(errorData?.error || `API 호출 실패 (상태 코드: ${response.status})`);
        }

        if (isEventStream) {
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('스트리밍 응답을 읽을 수 없습니다.');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const raw of lines) {
              const line = raw.trim();
              if (!line) continue;
              if (!line.startsWith('data:')) continue;

              const data = line.replace(/^data:\s*/, '');
              if (data === '[DONE]') {
                buffer = '';
                break;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed?.content) content += parsed.content;
              } catch {
                // ignore
              }
            }
          }
        } else {
          const data = await response.json();
          content = data.content || data.error || '응답 생성 실패';
        }
        const endTime = Date.now();

        updateComparisonResponse(sessionId, modelId, {
          content: content || '응답 생성 실패',
          timestamp: new Date(),
          tokens: 0,
          cost: 1,
          latency: endTime - startTime,
        });

        toast.success(`${models.find(m => m.id === modelId)?.displayName} 응답 완료`);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(`Error with ${modelId}:`, error);
        }
        updateComparisonResponse(sessionId, modelId, {
          content: '오류가 발생했습니다.',
          timestamp: new Date(),
          tokens: 0,
          cost: 0,
          latency: 0,
        });
      }
    });

    await Promise.allSettled(tasks);

    setIsComparing(false);
    toast.success('모든 모델 비교 완료!');
  };

  const handleCopy = useCallback((modelId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(prev => ({ ...prev, [modelId]: true }));
    toast.success('복사되었습니다');
    setTimeout(() => {
      setCopied(prev => ({ ...prev, [modelId]: false }));
    }, 2000);
  }, []);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">모델 비교</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">여러 AI 모델의 응답을 동시에 비교하세요</p>
      </div>

      {/* 모델 선택 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">모델 선택</h3>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {selectedModels.length}/4 선택됨
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {availableModels.map(model => {
            const isSelected = selectedModels.includes(model.id);
            return (
              <button
                key={model.id}
                onClick={() => toggleModel(model.id)}
                className={cn(
                  "relative p-4 rounded-lg border-2 transition-colors",
                  isSelected
                    ? "border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600"
                )}
              >
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white dark:text-gray-900" />
                  </div>
                )}
                <div className="text-left">
                  <div className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                    {model.displayName}
                  </div>
                  {((wallet?.credits[model.id] || 0) > 0) ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {wallet?.credits[model.id] || 0}회 남음
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 프롬프트 입력 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
          비교할 프롬프트
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="여러 모델에게 동일한 질문을 해보세요..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
        />
        
        <button
          onClick={handleStartComparison}
          disabled={isComparing || selectedModels.length < 2 || !prompt.trim()}
          className={cn(
            "mt-4 w-full py-3 px-6 rounded-lg font-medium transition-colors",
            "flex items-center justify-center gap-2",
            isComparing || selectedModels.length < 2 || !prompt.trim()
              ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900"
          )}
        >
          {isComparing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              비교 중...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              비교 시작
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      {/* 비교 결과 */}
      {activeComparison && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">비교 결과</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeComparison.models.map((modelId) => {
              const model = models.find(m => m.id === modelId);
              const response = activeComparison.responses[modelId];
              
              return (
                <div
                  key={modelId}
                  className={cn(
                    "relative bg-white dark:bg-gray-800 rounded-lg p-6 border-2 transition-colors",
                    "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {model?.displayName}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="w-3 h-3" />
                          {response ? `${response.latency}ms` : '생성 중...'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {response && (
                        <button
                          onClick={() => handleCopy(modelId, response.content)}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="복사"
                        >
                          {copied[modelId] ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {response ? response.content : '응답 생성 중...'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelComparison;
