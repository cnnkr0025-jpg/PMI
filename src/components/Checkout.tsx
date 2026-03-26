'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { calculatePrice, formatWon, getFixedDisplayPriceOrFallback, calculatePMCEarn } from '@/utils/pricing';
import { CreditCard, CheckCircle, ArrowLeft, Coins, Info } from 'lucide-react';
import { toast } from 'sonner';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { csrfFetch } from '@/lib/csrfFetch';

export const Checkout: React.FC = React.memo(() => {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const { 
    models, 
    selections, 
    policy, 
    currentUser,
    isAuthenticated,
    hasFirstPurchase,
    userPlan,
    getAvailablePMC,
  } = useStore();
  
  // PMC 사용 여부 상태
  const [usePMCChecked, setUsePMCChecked] = useState(false);
  const [pmcToUse, setPmcToUse] = useState(0);
  
  // Toss SDK 프리로드 캐시 (페이지 진입 즉시 백그라운드 로드)  
  const tossInstanceRef = React.useRef<any>(null);
  useEffect(() => {
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (clientKey && !tossInstanceRef.current) {
      loadTossPayments(clientKey).then((instance) => {
        tossInstanceRef.current = instance;
      }).catch(() => {});
    }
  }, []);

  // 페이지 진입 시 인증 확인
  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ 인증되지 않은 사용자, 로그인 페이지로 이동');
      }
      toast.error('로그인이 필요합니다.');
      router.push('/login');
    }
  }, [isAuthenticated, currentUser, router]);
  
  const priceCalculation = useMemo(() => {
    // 첫 구매가 아닌 경우에만 20% 할인 적용
    return calculatePrice(models, selections, policy, !hasFirstPurchase);
  }, [models, selections, policy, hasFirstPurchase]);
  
  const selectedModels = useMemo(() => {
    return selections
      .filter(sel => sel.quantity > 0)
      .map(sel => {
        const model = models.find(m => m.id === sel.modelId);
        const isVideoModel = model?.series === 'video';
        return {
          ...sel,
          model: model!,
          // 비디오 모델은 `quantity`가 초 단위이므로, 단가도 초당 가격을 사용
          displayPrice: model
            ? isVideoModel
              ? (model.pricePerSecond ?? model.piWon)
              : getFixedDisplayPriceOrFallback(model.id, model.piWon, model.tier).price
            : 0,
        };
      });
  }, [selections, models]);

  // PMC 계산
  const pmcCalculation = useMemo(() => {
    return calculatePMCEarn(models, selections, priceCalculation.finalTotal, userPlan);
  }, [models, selections, priceCalculation.finalTotal, userPlan]);
  
  // 보유 PMC
  const availablePMC = getAvailablePMC();
  
  // 사용 가능한 최대 PMC (보유 PMC와 결제금액의 30% 중 작은 값)
  const maxUsablePMC = Math.min(availablePMC, pmcCalculation.maxUsable);
  
  // PMC 사용 시 실제 결제 금액
  const actualPaymentAmount = useMemo(() => {
    if (usePMCChecked && pmcToUse > 0) {
      return Math.max(0, priceCalculation.finalTotal - pmcToUse);
    }
    return priceCalculation.finalTotal;
  }, [priceCalculation.finalTotal, usePMCChecked, pmcToUse]);
  
  // PMC 체크박스 변경 시
  const handlePMCCheckChange = (checked: boolean) => {
    setUsePMCChecked(checked);
    if (checked) {
      setPmcToUse(maxUsablePMC);
    } else {
      setPmcToUse(0);
    }
  };

  const prepareSecurePayment = async () => {
    const response = await csrfFetch('/api/payments/toss/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selections,
        pmcToUse: usePMCChecked ? pmcToUse : 0,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.reason || result?.error || '결제 준비에 실패했습니다.');
    }

    localStorage.setItem('pending_purchase', JSON.stringify({
      orderId: result.orderId,
      orderToken: result.orderToken,
    }));

    return result as {
      orderId: string;
      amount: number;
      orderName: string;
      orderToken: string;
    };
  };

  const startTossPayment = async (method: 'CARD' | 'TRANSFER') => {
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY as string | undefined;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL as string | undefined;
      if (!clientKey || !baseUrl) {
        toast.error('결제 설정이 누락되었습니다. 환경변수를 확인하세요.');
        return;
      }
      if (selectedModels.length === 0) {
        toast.error('선택한 모델이 없습니다.');
        return;
      }

      const preparedOrder = await prepareSecurePayment();

      const tossPayments = tossInstanceRef.current || await loadTossPayments(clientKey);
      await tossPayments.requestPayment(method, {
        amount: preparedOrder.amount,
        orderId: preparedOrder.orderId,
        orderName: preparedOrder.orderName,
        successUrl: `${baseUrl}/checkout/success`,
        failUrl: `${baseUrl}/checkout/fail`,
        customerName: currentUser?.name || currentUser?.email || '사용자'
      } as any);
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Toss payment start error:', error);
      }
      toast.error('결제 시작에 실패했습니다.');
      setIsProcessing(false);
    }
  };

  const startKakaoPay = async () => {
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY as string | undefined;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL as string | undefined;
      if (!clientKey || !baseUrl) {
        toast.error('결제 설정이 누락되었습니다. 환경변수를 확인하세요.');
        return;
      }
      if (selectedModels.length === 0) {
        toast.error('선택한 모델이 없습니다.');
        return;
      }

      const preparedOrder = await prepareSecurePayment();

      const tossPayments = tossInstanceRef.current || await loadTossPayments(clientKey);
      await tossPayments.requestPayment('EASY_PAY' as any, {
        easyPay: 'KAKAOPAY',
        amount: preparedOrder.amount,
        orderId: preparedOrder.orderId,
        orderName: preparedOrder.orderName,
        successUrl: `${baseUrl}/checkout/success`,
        failUrl: `${baseUrl}/checkout/fail`,
        customerName: currentUser?.name || currentUser?.email || '사용자'
      } as any);
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('KakaoPay start error:', error);
      }
      toast.error('카카오페이 시작에 실패했습니다.');
      setIsProcessing(false);
    }
  };
  
  const handlePaymentClick = () => {
    // 결제 확인 모달 표시
    setShowConfirmModal(true);
  };

  const handleConfirmPayment = async () => {
    setShowConfirmModal(false);
    setIsProcessing(true);
    try {
      await startTossPayment('CARD');
    } catch {
      setIsProcessing(false);
    }
  };

  const handleCancelPayment = () => {
    setShowConfirmModal(false);
  };

  const handleBack = () => {
    router.push('/configurator');
  };
  
  if (!paymentComplete && selectedModels.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card variant="bordered" className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <p className="text-gray-600 mb-4">선택한 모델이 없습니다.</p>
            <Button onClick={handleBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              모델 선택으로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card variant="elevated" className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">결제 완료!</h2>
            <p className="text-gray-600 mb-4">
              크레딧이 지갑에 충전되었습니다.
            </p>
            <p className="text-sm text-gray-500">
              잠시 후 대시보드로 이동합니다...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <>
      {/* 결제 확인 모달 */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card variant="elevated" className="max-w-md w-full shadow-2xl">
            <CardHeader>
              <h2 className="text-xl font-bold text-center">결제 확인</h2>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-primary-600" />
                </div>
                <p className="text-gray-700 mb-2">
                  <span className="font-bold text-2xl text-primary-600">
                    {formatWon(actualPaymentAmount)}
                  </span>
                  을(를) 결제하시겠습니까?
                </p>
                <p className="text-sm text-gray-500">
                  선택한 모델: {priceCalculation.selectedModelsCount}개
                </p>
              </div>
              
              <div className="space-y-2 mb-4 bg-gray-50 rounded-lg p-4">
                {selectedModels.map((item) => (
                  <div key={item.modelId} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.model.displayName}</span>
                    <span className="font-semibold">
                      {item.quantity}
                      {item.model.series === 'video' ? '초' : '회'}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* PMC 사용/적립 정보 */}
              <div className="space-y-2 mb-6">
                {usePMCChecked && pmcToUse > 0 && (
                  <div className="flex justify-between text-sm bg-yellow-50 rounded-lg p-3">
                    <span className="text-yellow-700">PMC 사용</span>
                    <span className="font-semibold text-yellow-600">-{pmcToUse.toLocaleString()} PMC</span>
                  </div>
                )}
                {pmcCalculation.earnAmount > 0 && (
                  <div className="flex justify-between text-sm bg-green-50 rounded-lg p-3">
                    <span className="text-green-700">적립 예정</span>
                    <span className="font-semibold text-green-600">+{pmcCalculation.earnAmount.toLocaleString()} PMC</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={handleCancelPayment}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  onClick={handleConfirmPayment}
                >
                  결제하기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          onClick={handleBack}
          variant="ghost"
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          돌아가기
        </Button>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 주문 내역 */}
          <div className="lg:col-span-2">
            <Card variant="bordered">
              <CardHeader>
                <h2 className="text-xl font-semibold">주문 내역</h2>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {selectedModels.map((item, index) => (
                    <div
                      key={item.modelId}
                      className="flex items-center justify-between pb-4 border-b last:border-0"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{item.model.displayName}</h4>
                        <p className="text-sm text-gray-600">
                          {formatWon(item.displayPrice)}/{item.model.series === 'video' ? '초' : '회'} ×{' '}
                          {item.quantity}
                          {item.model.series === 'video' ? '초' : '회'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatWon(item.displayPrice * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* 결제 요약 */}
          <div>
            <Card variant="elevated">
              <CardHeader>
                <h3 className="text-lg font-semibold">결제 요약</h3>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">상품 금액</span>
                    <span>{formatWon(priceCalculation.subtotal)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">수수료</span>
                    <span>{formatWon(priceCalculation.subtotalWithMargin - priceCalculation.subtotal)}</span>
                  </div>
                  
                  {priceCalculation.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-600">할인</span>
                        <Badge variant="success" size="sm">
                          {!hasFirstPurchase ? '첫 구매' : priceCalculation.discountType === 'series' ? '시리즈' : '개별'} 
                          {' '}
                          {(priceCalculation.discountRate * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <span className="text-green-600">
                        -{formatWon(priceCalculation.discountAmount)}
                      </span>
                    </div>
                  )}
                  
                  {/* PMC 사용 섹션 */}
                  {availablePMC > 0 && (
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium">보유 PMC</span>
                        </div>
                        <span className="text-sm font-semibold text-yellow-600">{availablePMC.toLocaleString()} PMC</span>
                      </div>
                      <label className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={usePMCChecked}
                          onChange={(e) => handlePMCCheckChange(e.target.checked)}
                          className="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                        />
                        <span className="text-sm text-gray-700">
                          PMC 사용하기
                        </span>
                      </label>
                      {usePMCChecked && (
                        <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-lg">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-600 flex-shrink-0">사용할 PMC</label>
                              <div className="flex-1 relative">
                                <input
                                  type="number"
                                  min="0"
                                  max={maxUsablePMC}
                                  step="1"
                                  value={pmcToUse}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    if (value >= 0 && value <= maxUsablePMC) {
                                      setPmcToUse(value);
                                    } else if (value > maxUsablePMC) {
                                      setPmcToUse(maxUsablePMC);
                                    }
                                  }}
                                  className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
                              </div>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={maxUsablePMC}
                              step="1"
                              value={pmcToUse}
                              onChange={(e) => setPmcToUse(Number(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                            />
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>0원</span>
                              <span>최대 {maxUsablePMC.toLocaleString()}원</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setPmcToUse(Math.floor(maxUsablePMC * 0.25))}
                              className="flex-1 px-2 py-1 text-xs bg-white hover:bg-gray-100 border border-gray-200 rounded transition-colors"
                            >
                              25%
                            </button>
                            <button
                              type="button"
                              onClick={() => setPmcToUse(Math.floor(maxUsablePMC * 0.5))}
                              className="flex-1 px-2 py-1 text-xs bg-white hover:bg-gray-100 border border-gray-200 rounded transition-colors"
                            >
                              50%
                            </button>
                            <button
                              type="button"
                              onClick={() => setPmcToUse(Math.floor(maxUsablePMC * 0.75))}
                              className="flex-1 px-2 py-1 text-xs bg-white hover:bg-gray-100 border border-gray-200 rounded transition-colors"
                            >
                              75%
                            </button>
                            <button
                              type="button"
                              onClick={() => setPmcToUse(maxUsablePMC)}
                              className="flex-1 px-2 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-700 border border-yellow-300 rounded transition-colors font-medium"
                            >
                              최대
                            </button>
                          </div>
                          {pmcToUse > 0 && (
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                              <span className="text-gray-600">PMC 차감</span>
                              <span className="text-yellow-600 font-medium">-{pmcToUse.toLocaleString()}원</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">총 결제 금액</span>
                      <span className="text-2xl font-bold text-primary-600">
                        {formatWon(actualPaymentAmount)}
                      </span>
                    </div>
                  </div>
                  
                  {/* PMC 적립 예정 */}
                  {pmcCalculation.earnAmount > 0 && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-3 border border-yellow-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Coins className="w-5 h-5 text-yellow-500" />
                          <span className="text-sm font-medium text-gray-700">결제 후 적립 예정</span>
                        </div>
                        <span className="text-lg font-bold text-yellow-600">+{pmcCalculation.earnAmount.toLocaleString()} PMC</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Info className="w-3 h-3" />
                        <span>적립률 {(pmcCalculation.totalRate * 100).toFixed(1)}% (90일 유효)</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="p-6 pt-0">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handlePaymentClick}
                  isLoading={isProcessing}
                  disabled={isProcessing}
                >
                  {isProcessing ? '결제 처리 중...' : `${formatWon(actualPaymentAmount)} 결제하기`}
                </Button>
              </CardFooter>
            </Card>
            
            {/* 안내 사항 */}
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                결제 완료 후 선택한 모델별로 크레딧이 지급됩니다.
                크레딧은 채팅 시 1회씩 차감됩니다.
              </p>
            </div>
            
            {/* PMC 안내 */}
            <div className="mt-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-start gap-2">
                <Coins className="w-4 h-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-yellow-800 mb-1">PMC (Pick-My-Coin) 안내</p>
                  <ul className="text-xs text-yellow-700 space-y-0.5">
                    <li>• 1 PMC = 1원으로 결제 시 사용 가능</li>
                    <li>• 모델을 많이 선택할수록 적립률 증가</li>
                    <li>• 1회 결제 시 최대 30%까지 사용 가능</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </>
  );
});

Checkout.displayName = 'Checkout';
