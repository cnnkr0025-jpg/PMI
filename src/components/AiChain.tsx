'use client';

import React, { useState, useCallback } from 'react';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { Plus, X, Play, ChevronDown, ChevronUp, ArrowDown, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';

type Props = {
  availableModels: any[];
  walletCredits: { [modelId: string]: number };
  modelById: Map<string, any>;
  onClose?: () => void;
  language?: string;
  speechLevel?: string;
};

type ChainStep = {
  id: string;
  modelId: string;
  role: string;
};

type StepResult = {
  stepId: string;
  modelId: string;
  role: string;
  content: string;
  loading: boolean;
  error?: string;
};

const ROLE_PRESETS = [
  { value: '초안 작성', label: '초안 작성' },
  { value: '검토 및 개선', label: '검토 및 개선' },
  { value: '팩트체크', label: '팩트체크' },
  { value: '요약', label: '요약' },
  { value: '번역', label: '번역' },
  { value: '코드 최적화', label: '코드 최적화' },
  { value: '최종 완성', label: '최종 완성' },
];

export const AiChain: React.FC<Props> = ({ availableModels, walletCredits, modelById, language, speechLevel }) => {
  const { deductCredit } = useStore();
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState<ChainStep[]>([
    { id: '1', modelId: '', role: '초안 작성' },
    { id: '2', modelId: '', role: '검토 및 개선' },
  ]);
  const [results, setResults] = useState<StepResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const textModels = availableModels.filter(m =>
    m.series !== 'image' && m.series !== 'video' && !m.isBatch
  );

  const addStep = () => {
    if (steps.length >= 6) { toast.error('최대 6단계까지 가능합니다.'); return; }
    setSteps(prev => [...prev, { id: Date.now().toString(), modelId: '', role: '최종 완성' }]);
  };

  const removeStep = (id: string) => {
    if (steps.length <= 2) { toast.error('최소 2단계가 필요합니다.'); return; }
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const updateStep = (id: string, field: keyof ChainStep, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const totalCost = steps.filter(s => s.modelId).length;

  const getStepOutputTokenLimit = useCallback((stepIndex: number): number | undefined => {
    if (stepIndex >= steps.length - 1) return undefined;

    const nextStep = steps[stepIndex + 1];
    const nextModel = modelById.get(nextStep.modelId);
    if (!nextModel) return undefined;

    const maxInput =
      typeof nextModel.tokenBudget?.input === 'number'
        ? nextModel.tokenBudget.input
        : nextModel.maxCharacters;

    if (!Number.isFinite(maxInput) || maxInput <= 0) return undefined;
    return Math.floor(maxInput);
  }, [steps, modelById]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) { toast.error('질문을 입력해주세요.'); return; }
    const incomplete = steps.find(s => !s.modelId);
    if (incomplete) { toast.error('모든 단계에 모델을 선택해주세요.'); return; }

    for (const step of steps) {
      const credits = walletCredits[step.modelId] || 0;
      if (credits <= 0) {
        toast.error(`${modelById.get(step.modelId)?.displayName} 크레딧이 부족합니다.`);
        return;
      }
    }

    setIsRunning(true);
    const initResults: StepResult[] = steps.map(s => ({
      stepId: s.id, modelId: s.modelId, role: s.role, content: '', loading: false
    }));
    setResults(initResults);

    let prevOutput = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const chainMaxOutputTokens = getStepOutputTokenLimit(i);
      setResults(prev => prev.map(r => r.stepId === step.id ? { ...r, loading: true } : r));
      setExpandedStep(step.id);

      try {
        deductCredit(step.modelId).catch(() => {});

        // 첫 단계가 아닌 경우, AI가 자체적으로 맞춤형 프롬프트를 작성하도록 함
        let messageContent: string;
        if (i === 0) {
          messageContent = prompt;
        } else {
          const prevStep = steps[i - 1];
          messageContent = `당신은 AI 체인의 ${step.role} 담당입니다.\n\n이전 단계(${prevStep.role})의 출력:\n\n${prevOutput}\n\n원본 요청: ${prompt}\n\n위 내용을 바탕으로 ${step.role} 역할을 수행하세요. 이전 AI의 출력을 개선하고 완성해주세요.`;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: messageContent }],
            modelId: step.modelId,
            language: language || 'ko',
            speechLevel: speechLevel || 'formal',
            temperature: 0.7,
            chainMaxOutputTokens,
          }),
        });

        if (!res.ok) throw new Error('API 오류');
        const data = await res.json();
        const content = data.content || '';
        prevOutput = content;

        setResults(prev => prev.map(r =>
          r.stepId === step.id ? { ...r, content, loading: false } : r
        ));
      } catch (e: any) {
        setResults(prev => prev.map(r =>
          r.stepId === step.id ? { ...r, loading: false, error: '오류가 발생했습니다.' } : r
        ));
        toast.error(`${i + 1}단계에서 오류가 발생했습니다.`);
        setIsRunning(false);
        return;
      }
    }

    setIsRunning(false);
    toast.success('AI 체인이 완료되었습니다.');
  }, [prompt, steps, walletCredits, modelById, deductCredit, language, speechLevel, getStepOutputTokenLimit]);

  const finalResult = results.find(r => r.stepId === steps[steps.length - 1]?.id);

  return (
    <div className="p-5">
      <div className="mb-4 p-3 bg-orange-50 rounded-xl text-sm text-orange-700 border border-orange-200">
        각 AI가 이전 AI의 답변을 보고 개선합니다. 마지막 단계의 답변이 최종 결과물입니다.
      </div>

      {/* 체인 설정 */}
      <div className="mb-4 space-y-2">
        <div className="text-sm font-semibold text-gray-700">체인 구성</div>
        {steps.map((step, idx) => (
          <div key={step.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
              <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold shrink-0">
                {idx + 1}
              </div>
              <select
                value={step.modelId}
                onChange={e => updateStep(step.id, 'modelId', e.target.value)}
                className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white focus:outline-none"
              >
                <option value="">모델 선택...</option>
                {textModels.map(m => (
                  <option key={m.id} value={m.id}>{m.displayName} (잔여 {walletCredits[m.id] || 0}회)</option>
                ))}
              </select>
              <select
                value={step.role}
                onChange={e => updateStep(step.id, 'role', e.target.value)}
                className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white focus:outline-none"
              >
                {ROLE_PRESETS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button onClick={() => removeStep(step.id)} className="p-1 hover:bg-gray-200 rounded text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {idx < steps.length - 1 && (
              <div className="flex justify-center">
                <ArrowDown className="w-4 h-4 text-orange-400" />
              </div>
            )}
          </div>
        ))}
        <button
          onClick={addStep}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          <Plus className="w-4 h-4" />단계 추가
        </button>
      </div>

      {/* 질문 입력 */}
      <div className="mb-4">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="체인에 보낼 질문이나 작업을 입력하세요..."
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
          rows={3}
        />
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="text-xs text-gray-500">총 {totalCost}회 크레딧 차감 예정</div>
        <button
          onClick={handleRun}
          disabled={isRunning || !prompt.trim() || steps.some(s => !s.modelId)}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-4 h-4" />
          {isRunning ? '실행 중...' : '체인 실행'}
        </button>
      </div>

      {/* 결과 */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">단계별 결과</div>
          {results.map((r, idx) => (
            <div key={r.stepId} className={cn('border rounded-xl overflow-hidden', idx === results.length - 1 ? 'border-orange-400' : 'border-gray-200')}>
              <button
                className={cn('w-full flex items-center justify-between px-4 py-3 text-sm font-medium', idx === results.length - 1 ? 'bg-orange-50 text-orange-800' : 'bg-gray-50 text-gray-700')}
                onClick={() => setExpandedStep(expandedStep === r.stepId ? null : r.stepId)}
              >
                <span>
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-xs inline-flex items-center justify-center mr-2 font-bold">{idx + 1}</span>
                  {modelById.get(r.modelId)?.displayName} — {r.role}
                  {idx === results.length - 1 && <span className="ml-2 text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full">최종 결과</span>}
                </span>
                {expandedStep === r.stepId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedStep === r.stepId && (
                <div className="p-4">
                  {r.loading ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      생성 중...
                    </div>
                  ) : r.error ? (
                    <div className="text-red-500 text-sm">{r.error}</div>
                  ) : (
                    <div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{r.content}</div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(r.content); toast.success('복사했습니다!'); }}
                        className="mt-2 text-xs text-blue-600 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />복사
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 최종 결과 강조 */}
          {finalResult?.content && !finalResult.loading && (
            <div className="mt-4 p-4 bg-orange-50 border-2 border-orange-400 rounded-xl">
              <div className="text-sm font-bold text-orange-700 mb-2">최종 결과 (체인 완성)</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{finalResult.content}</div>
              <button
                onClick={() => { navigator.clipboard.writeText(finalResult.content); toast.success('복사했습니다!'); }}
                className="mt-2 text-xs text-orange-600 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />복사
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
