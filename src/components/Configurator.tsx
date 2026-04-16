'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { ModelCard } from '@/components/ModelCard';
import { PriceSummary } from '@/components/PriceSummary';
import { calculatePrice, calculatePMCEarn } from '@/utils/pricing';
import { seriesInfo } from '@/data/models';
import { cn } from '@/utils/cn';
import { Gift, Percent, Sparkles, TrendingDown, Zap, Check, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/utils/translations';

// 모델별 보험 보장 배수 계산 (보험 구매 시)
// sonar: 500배, 그 외: floor(500/piWon)+1배
export function getInsuranceMultiplier(modelId: string, piWon: number): number {
  if (modelId === 'sonar') return 500;
  return Math.floor(500 / Math.max(piWon, 1)) + 1;
}

const categories = [
  { id: 'all', name: '전체' },
  { id: 'gpt', name: 'GPT 시리즈' },
  { id: 'claude', name: 'Claude 시리즈' },
  { id: 'perplexity', name: 'Perplexity 시리즈' },
  { id: 'coding', name: '코딩' },
  { id: 'image', name: '이미지' },
  { id: 'video', name: '영상' },
  { id: 'other', name: '기타' },
];

// 기타 탭 상품들
const OTHER_ITEMS = [
  {
    id: 'smart-router-premium',
    name: '스마트 라우터 프리미엄',
    description: '질문 분석 시 상위 5개 모델 순위를 보여줍니다. PMC 100% 사용 가능.',
    price: 250,
    icon: '🧠',
    features: ['5위 상세 모델 순위', '각 모델 추천 이유', '질문 유형 자동 분석', '영구 구매 (1회 구매 시 계속 사용)'],
    storeKey: 'smartRouterPurchased' as const,
    pmc100: true,
  },
  {
    id: 'error-insurance',
    name: 'AI 에러 보험',
    description: 'AI 응답 에러 발생 시 최대 500배 크레딧을 보장합니다. 구매일로부터 90일간 유효.',
    price: 500,
    icon: '🛡️',
    features: [
      '에러 발생 시 최대 500배 크레딧 환불',
      'Perplexity Sonar: 500배 보장',
      '그 외 모델: floor(500÷단가)+1배 보장',
      '보험 없어도 기본 1크레딧은 무조건 환불',
      '유효기간 90일 (구매일로부터)',
    ],
    storeKey: 'insurancePurchased' as const,
    pmc100: true,
  },
];

const VISIBLE_OTHER_ITEMS = OTHER_ITEMS.filter((item) => item.id !== 'error-insurance');

export const Configurator: React.FC = () => {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState('all');
  const { models, selections, policy, hasFirstPurchase, updateSelection, userPlan, smartRouterPurchased, setSmartRouterPurchased, insurancePurchased, setInsurancePurchased, getAvailablePMC, usePMC } = useStore();
  const { t } = useTranslation();
  
  const filteredModels = useMemo(() => {
    if (activeCategory === 'all') {
      return models.filter(m => m.enabled);
    }
    return models.filter(m => m.enabled && m.series === activeCategory);
  }, [models, activeCategory]);
  
  const priceCalculation = useMemo(() => {
    return calculatePrice(models, selections, policy, !hasFirstPurchase);
  }, [models, selections, policy, hasFirstPurchase]);
  
  const pmcCalculation = useMemo(() => {
    return calculatePMCEarn(models, selections, priceCalculation.finalTotal, userPlan);
  }, [models, selections, priceCalculation.finalTotal, userPlan]);
  
  const handleCheckout = () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('🛒 결제하기 버튼 클릭:', {
        selectedModelsCount: priceCalculation.selectedModelsCount,
        selections: selections,
        totalAmount: priceCalculation.finalTotal
      });
    }
    
    if (priceCalculation.selectedModelsCount === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ 선택된 모델이 없음');
      }
      toast.error('모델을 먼저 선택해주세요.');
      return;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ 결제 페이지로 이동 중...');
    }
    // Next.js router로 이동 (상태 유지)
    router.push('/checkout');
  };
  
  const getQuantity = (modelId: string) => {
    const selection = selections.find(s => s.modelId === modelId);
    return selection?.quantity || 0;
  };
  
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">{t.configurator.title}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t.configurator.subtitle}</p>
        </div>
        
        
        <div className="flex gap-6">
          {/* 왼쪽: 모델 리스트 */}
          <div className="flex-1">
            {/* 카테고리 탭 */}
            <div className="mb-6 bg-gray-100 rounded-lg p-1 flex space-x-1">
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    activeCategory === category.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
            
            {/* 시리즈 정보 섹션 제거됨 */}
            
            {/* 영상 모델 할인 미적용 안내 */}
            {(activeCategory === 'video' || (activeCategory === 'all' && filteredModels.some(m => m.series === 'video'))) && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  영상 모델은 할인이나 프로모션이 적용되지 않습니다.
                </p>
              </div>
            )}

            {/* 기타 탭 */}
            {activeCategory === 'other' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {VISIBLE_OTHER_ITEMS.map(item => {
                  const isPurchased =
                    (item.storeKey === 'smartRouterPurchased' && smartRouterPurchased) ||
                    (item.storeKey === 'insurancePurchased' && insurancePurchased);
                  const availablePMC = getAvailablePMC();
                  const canPayWithPMC = item.pmc100 && availablePMC >= item.price;

                  const handleBuy = () => {
                    if (isPurchased) { toast.info('이미 구매한 상품입니다.'); return; }
                    if (canPayWithPMC) {
                      useStore.getState().usePMC(item.price, `${item.name} 구매`, `other-${Date.now()}`);
                      if (item.storeKey === 'smartRouterPurchased') setSmartRouterPurchased(true);
                      if (item.storeKey === 'insurancePurchased') setInsurancePurchased(true);
                      toast.success(`✅ ${item.name} 구매 완료! (-${item.price} PMC)`);
                    } else if (availablePMC > 0 && availablePMC < item.price) {
                      toast.error(`PMC가 ${item.price - availablePMC}원 부족합니다. 보유: ${availablePMC} PMC`);
                    } else {
                      toast.info('PMC가 없으면 현금 결제 기능은 준비 중입니다.');
                    }
                  };

                  return (
                    <div key={item.id} className={cn(
                      'border-2 rounded-2xl p-6 transition-all',
                      isPurchased ? 'border-green-400 bg-green-50' : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 hover:border-indigo-400'
                    )}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-3xl mb-2">{item.icon}</div>
                          <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                        </div>
                        {isPurchased && (
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                      <ul className="space-y-1.5 mb-4">
                        {item.features.map(f => (
                          <li key={f} className="text-sm text-gray-700 flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-bold text-indigo-600">{item.price}원</div>
                          {item.pmc100 && (
                            <div className="text-xs text-yellow-600 font-medium">💰 PMC 100% 사용 가능</div>
                          )}
                          <div className="text-xs text-gray-500 mt-0.5">보유 PMC: {availablePMC}원</div>
                        </div>
                        <button
                          onClick={handleBuy}
                          disabled={isPurchased}
                          className={cn(
                            'px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                            isPurchased
                              ? 'bg-green-100 text-green-700 cursor-default'
                              : canPayWithPMC
                                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          )}
                        >
                          {isPurchased ? '구매 완료 ✓' : canPayWithPMC ? 'PMC로 구매' : '구매'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
            {/* 모델 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredModels.map(model => (
                <ModelCard
                  key={model.id}
                  model={model}
                  quantity={getQuantity(model.id)}
                  onQuantityChange={(quantity) => updateSelection(model.id, quantity)}
                  isSelected={getQuantity(model.id) > 0}
                />
              ))}
            </div>
            
            {filteredModels.length === 0 && (
              <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500 text-sm">이 카테고리에 사용 가능한 모델이 없습니다.</p>
              </div>
            )}
            </>)}
          </div>
          
          {/* 오른쪽: 가격 요약 */}
          <div className="w-96">
            <PriceSummary
              calculation={priceCalculation}
              pmcCalculation={pmcCalculation}
              onCheckout={handleCheckout}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
