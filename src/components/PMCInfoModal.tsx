'use client';

import React from 'react';
import { X } from 'lucide-react';

interface PMCInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EARN_RATES = [
  { qty: 1, rate: '0%', label: '1개 선택' },
  { qty: 2, rate: '3%', label: '2개 선택' },
  { qty: 3, rate: '6%', label: '3개 선택' },
  { qty: 4, rate: '9%', label: '4개 선택' },
  { qty: 5, rate: '10%', label: '5개 이상', highlight: true },
];


export const PMCInfoModal: React.FC<PMCInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">PMC — Pick-My-Coin</h2>
              <p className="text-xs text-gray-400 mt-0.5">구매 적립 포인트 안내</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="px-6 py-6 space-y-8">
            {/* 개요 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">개요</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '1 PMC =', value: '1원' },
                  { label: '최대 사용', value: '결제의 30%' },
                  { label: '유효기간', value: '90일' },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                AI 모델을 구매할 때 자동으로 적립됩니다. 적립된 PMC는 다음 결제 시 현금처럼 차감할 수 있습니다.
              </p>
            </section>

            {/* 적립률 테이블 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">선택 수량별 기본 적립률</h3>
              <p className="text-xs text-gray-400">공식: min(3% × (총 수량 − 1), 10%)</p>
              <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                {EARN_RATES.map((row, i) => (
                  <div
                    key={row.qty}
                    className={`flex items-center justify-between px-4 py-3 text-sm ${
                      i !== EARN_RATES.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                    } ${row.highlight ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}
                  >
                    <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                    <span className={`font-semibold ${row.highlight ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                      {row.rate}{row.highlight ? ' (최대)' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* 계산 예시 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">계산 예시</h3>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 text-sm">
                <p className="text-gray-600 dark:text-gray-300">GPT-4o(10원) + Claude Sonnet 4.5(45원) 동시 선택</p>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <p>기본 적립률: 3% × (2 − 1) = 3%</p>
                  <p>GPT-4o: 10 × 3% = 0.3 PMC</p>
                  <p>Sonnet 4.5: 45 × 3% = 1.35 PMC</p>
                  <p className="font-semibold text-gray-700 dark:text-gray-300 pt-1">총 적립: 1 PMC (소수점 버림)</p>
                </div>
              </div>
            </section>

            {/* 사용 한도 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">사용 한도 및 정책</h3>
              <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                {[
                  ['1회 최대 사용', '결제 금액의 30% 또는 10,000원 중 작은 금액'],
                  ['유효기간', '적립일로부터 90일, 만료 시 자동 소멸'],
                  ['환불 처리', '환불 발생 시 사용한 PMC는 복구되지 않음'],
                  ['1회 사용 최대', '10,000원'],
                ].map(([label, desc], i, arr) => (
                  <div key={label} className={`flex gap-3 px-4 py-3 text-sm ${i !== arr.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                    <span className="text-gray-400 shrink-0 w-28">{label}</span>
                    <span className="text-gray-700 dark:text-gray-300">{desc}</span>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* 푸터 */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
