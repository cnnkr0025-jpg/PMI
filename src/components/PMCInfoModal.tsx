'use client';

import React from 'react';
import { X, Coins, Info, TrendingUp, Shield } from 'lucide-react';

interface PMCInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PMCInfoModal: React.FC<PMCInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Coins className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">PMC (Pick-My-Coin)</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">적립 시스템 안내</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* 내용 */}
          <div className="px-6 py-6 space-y-6">
            {/* PMC란? */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">PMC란?</h3>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                PMC(Pick-My-Coin)는 AI 모델 구매 시 적립되는 <span className="font-semibold text-yellow-600">현금성 포인트</span>입니다. 
                <span className="font-semibold">1 PMC = 1원</span>이며, 적립된 PMC는 다음 구매 시 결제 금액의 <span className="font-semibold text-yellow-600">최대 30%</span>까지 현금처럼 사용할 수 있습니다. 
                유효기간은 <span className="font-semibold text-yellow-600">90일</span>입니다.
              </p>
            </section>

            {/* 적립 조건 */}
            <section className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">적립 조건</h3>
              </div>
              <div className="space-y-2">
                <p className="text-gray-700 dark:text-gray-300 font-semibold">
                  여러 모델을 섞어 담을수록 적립률이 올라갑니다!
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p>• 총 선택 수량 1개: PMC 적립 없음 (0%)</p>
                  <p>• 총 선택 수량 2개: 3% 적립</p>
                  <p>• 총 선택 수량 3개: 6% 적립</p>
                  <p>• 총 선택 수량 4개: 9% 적립</p>
                  <p>• 총 선택 수량 5개 이상: 10% 적립 (최대)</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-yellow-200 dark:border-yellow-700">
                  고가 모델(Opus 등)은 적립률이 5%로 제한됩니다 (역마진 방지)
                </p>
              </div>
            </section>

            {/* 플랜별 추가 적립 */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">플랜별 추가 적립</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Free</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">+0%</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-600 dark:text-blue-400">Plus</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">+2%</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <p className="text-sm text-purple-600 dark:text-purple-400">Pro</p>
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">+5%</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Max</p>
                  <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">+7%</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                * 플랜 보너스는 모든 구매에 적용됩니다
              </p>
            </section>

            {/* 계산 방법 */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Coins className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">계산 방법</h3>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1. 기본 적립률 계산</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    총 선택 수량에 따라 0%~10% 적립률이 결정됩니다<br/>
                    공식: min(3% × (총 수량 - 1), 10%)
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">2. 플랜 보너스 추가</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    가입 플랜에 따라 추가 적립률이 더해집니다<br/>
                    (Free: 0%, Plus: +2%, Pro: +5%, Max: +7%)
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">3. 티어별 상한 적용</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    고가 모델(Opus 등)은 적립률이 5%로 제한됩니다<br/>
                    일반 모델은 최대 10%까지 적립 가능<br/>
                    전체 적립률은 수수료율(11.9%)을 초과할 수 없습니다
                  </p>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">예시:</span> GPT-4o 1개 + Sonnet 4.5 1개 (총 2개, Plus 플랜)
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    → 기본 3% + 플랜 2% = 5%<br/>
                    → GPT-4o(10원): 0.5 PMC, Sonnet(20원): 1.0 PMC<br/>
                    → 총 1 PMC 적립 (소수점 버림)
                  </p>
                </div>
              </div>
            </section>

            {/* 사용 정책 */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">사용 정책</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-yellow-600 mt-0.5">•</span>
                  <span>PMC는 결제 금액의 <strong>최대 30%</strong>까지 사용 가능합니다</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-600 mt-0.5">•</span>
                  <span>1회 최대 <strong>10,000원</strong>까지 사용할 수 있습니다</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-600 mt-0.5">•</span>
                  <span>적립된 PMC는 <strong>90일간 유효</strong>하며, 만료 시 자동 소멸됩니다</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-600 mt-0.5">•</span>
                  <span>환불 시 사용한 PMC는 복구되지 않습니다</span>
                </li>
              </ul>
            </section>

            {/* 토큰 예산 안내 */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">토큰 예산 (1회 기준)</h3>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">GPT 시리즈</p>
                    <p className="text-gray-600 dark:text-gray-400">입력 500 / 출력 500</p>
                    <p className="text-xs text-gray-500">짧고 굵은 답변</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Claude 시리즈</p>
                    <p className="text-gray-600 dark:text-gray-400">입력 1000 / 출력 1000</p>
                    <p className="text-xs text-gray-500">&quot;혜자&quot; 마케팅 포인트</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Perplexity</p>
                    <p className="text-gray-600 dark:text-gray-400">입력 300 / 출력 300</p>
                    <p className="text-xs text-gray-500">검색 전용</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Gemini</p>
                    <p className="text-gray-600 dark:text-gray-400">입력 500 / 출력 500</p>
                    <p className="text-xs text-gray-500">균형잡힌 성능</p>
                  </div>
                </div>
              </div>
            </section>

            {/* 안내 메시지 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>팁:</strong> 여러 모델을 섞어 담으면 적립률이 올라갑니다! 
                총 5개 이상 선택 시 최대 10% 적립 (고가 모델 제외)
              </p>
            </div>
          </div>

          {/* 푸터 */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors font-medium"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
