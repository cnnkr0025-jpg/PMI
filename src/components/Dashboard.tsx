'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { 
  CreditCard, 
  TrendingUp, 
  Package, 
  MessageSquare,
  AlertCircle,
  Plus,
  BarChart3,
  Sparkles,
  Coins,
  Star
} from 'lucide-react';
import { formatWon } from '@/utils/pricing';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/utils/translations';

export const Dashboard: React.FC = () => {
  const router = useRouter();
  const { models, wallet, chatSessions, getAvailablePMC, pmcBalance, bookmarkedMessages } = useStore();
  const [showAllActivity, setShowAllActivity] = React.useState(false);
  const { t } = useTranslation();

  React.useEffect(() => {
    router.prefetch('/chat');
  }, [router]);
  
  // PMC 잔액
  const availablePMC = getAvailablePMC();
  
  // PMC로 아낀 금액 계산 (사용한 PMC 총액)
  const savedAmount = useMemo(() => {
    if (!wallet || !pmcBalance?.history) return 0;
    // 사용한 PMC만 합산 (type === 'use'인 거래의 절댓값)
    const usedPMC = pmcBalance.history
      .filter(tx => tx.type === 'use')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return usedPMC;
  }, [wallet, pmcBalance]);
  
  // 크레딧 통계 계산
  const creditStats = useMemo(() => {
    if (!wallet) return { total: 0, used: 0, remaining: 0, models: [] };
    
    const modelStats = models
      .filter(m => m.enabled)
      .map(model => {
        const credits = wallet.credits[model.id] || 0;
        const used = wallet.transactions.filter(
          t => t.type === 'usage' && t.modelId === model.id
        ).length;
        const total = credits + used;
        
        return {
          model,
          total,
          used,
          remaining: credits,
          usageRate: total > 0 ? (used / total) * 100 : 0,
        };
      })
      .filter(stat => stat.total > 0)
      .sort((a, b) => b.remaining - a.remaining);
    
    const totalCredits = modelStats.reduce((sum, stat) => sum + stat.total, 0);
    const usedCredits = modelStats.reduce((sum, stat) => sum + stat.used, 0);
    const remainingCredits = modelStats.reduce((sum, stat) => sum + stat.remaining, 0);
    
    return {
      total: totalCredits,
      used: usedCredits,
      remaining: remainingCredits,
      models: modelStats,
    };
  }, [models, wallet]);
  
  // 최근 거래 내역
  const allTransactions = useMemo(() => {
    if (!wallet) return [];
    return [...wallet.transactions]
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
  }, [wallet]);

  const recentTransactions = useMemo(() => {
    return showAllActivity ? allTransactions : allTransactions.slice(0, 5);
  }, [allTransactions, showAllActivity]);
  
  const handleRefill = useCallback(() => {
    router.push('/configurator');
  }, [router]);
  
  const handleStartChat = useCallback(() => {
    router.push('/chat');
  }, [router]);
  
  const getUsageColor = useCallback((rate: number) => {
    if (rate >= 80) return 'text-red-600 bg-red-100';
    if (rate >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  }, []);
  
  const getProgressColor = useCallback((rate: number) => {
    if (rate >= 80) return 'bg-red-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  }, []);

  
  if (!wallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center particles-bg">
        <Card variant="bordered" className="max-w-md w-full glass-card shadow-soft-lg animate-scale-in">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-100 to-purple-100 flex items-center justify-center">
              <Package className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">크레딧이 없습니다</h2>
            <p className="text-gray-600 mb-4">
              AI 모델을 사용하려면 먼저 크레딧을 구매해주세요.
            </p>
            <Button variant="primary" onClick={handleRefill}>
              <Plus className="w-4 h-4 mr-2" />
              크레딧 구매하기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 헤더 */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-1">{t.dashboard.title}</h1>
            <p className="text-gray-600 text-sm">{t.dashboard.description}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleStartChat}
              className="dashboard-start-chat-button px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              {t.dashboard.startChat}
            </button>
            <button
              onClick={handleRefill}
              className="dashboard-buy-credit-button px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.dashboard.buyCreditsButton}
            </button>
          </div>
        </div>
        
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          {/* PMC 잔액 카드 */}
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Coins className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
            <p className="text-2xl font-bold mb-1 text-yellow-700">{availablePMC.toLocaleString()}</p>
            <p className="text-sm text-yellow-600 font-medium">{t.dashboard.pmcBalance}</p>
            <p className="text-xs text-yellow-500 mt-1">{t.dashboard.pmcRate}</p>
          </div>
          
          {/* PMC로 아낀 금액 카드 */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold mb-1 text-green-700">{formatWon(savedAmount)}</p>
            <p className="text-sm text-green-600 font-medium">{t.dashboard.pmcSaved}</p>
            <p className="text-xs text-green-500 mt-1">💰 {t.dashboard.pmcRate}</p>
          </div>
          
          <div className="dashboard-credit-card bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-semibold mb-1 text-gray-900">{creditStats.total}</p>
            <p className="text-sm text-gray-600">{t.dashboard.totalCredits}</p>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{creditStats.used}</p>
            <p className="text-sm text-gray-600">{t.dashboard.usedCredits}</p>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{creditStats.remaining}</p>
            <p className="text-sm text-gray-600">{t.dashboard.remainingCredits}</p>
          </div>
          
          <div className="dashboard-chat-card bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{chatSessions.length}</p>
            <p className="text-sm text-gray-600">{t.dashboard.totalChats}</p>
          </div>
        </div>
        
        {/* 북마크 요약 */}
        <div className="mb-6">
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-400" />
              <h3 className="text-sm font-bold text-yellow-800">저장된 답변</h3>
            </div>
            {bookmarkedMessages.length === 0 ? (
              <p className="text-sm text-yellow-600">저장된 답변이 없습니다. 채팅에서 북마크 버튼을 눌러 저장하세요.</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-yellow-700 mb-1">{bookmarkedMessages.length}개</p>
                <div className="space-y-1 max-h-[80px] overflow-hidden">
                  {bookmarkedMessages.slice(0, 2).map(bm => (
                    <p key={bm.id} className="text-xs text-yellow-700 truncate">{bm.content.slice(0, 60)}...</p>
                  ))}
                </div>
                <button
                  onClick={() => router.push('/chat')}
                  className="mt-2 text-xs text-yellow-700 underline"
                >
                  채팅에서 보기
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 모델별 크레딧 현황 */}
          <div className="lg:col-span-2">
            <div className="dashboard-usage-card bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-gray-900">{t.dashboard.modelCredits}</h2>
                <BarChart3 className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                {creditStats.models.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">{t.dashboard.noModelCredits}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {creditStats.models.filter(stat => stat.remaining > 0).map(stat => (
                      <div key={stat.model.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-medium text-gray-900">{stat.model.displayName}</h4>
                          </div>
                          <span className="text-sm text-gray-600">
                            {stat.remaining} / {stat.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={cn('h-1.5 rounded-full transition-all', getProgressColor(stat.usageRate))}
                            style={{ width: `${stat.usageRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {creditStats.remaining < 10 && creditStats.remaining > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg flex items-start space-x-2 border border-yellow-200">
                    <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-900">
                        {t.dashboard.lowCredits}
                      </p>
                      <p className="text-yellow-700 text-xs mt-0.5">
                        {t.dashboard.refillCredits}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* 최근 거래 내역 */}
          <div>
            <div className="dashboard-activity-card bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-gray-900">{t.dashboard.recentActivity}</h2>
                {allTransactions.length > 5 && (
                  <button
                    onClick={() => setShowAllActivity(!showAllActivity)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {showAllActivity ? '최근만' : '전체보기'}
                  </button>
                )}
              </div>
              <div>
                {recentTransactions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">{t.dashboard.noActivity}</p>
                  </div>
                ) : (
                  <div className={`space-y-3 ${showAllActivity ? 'max-h-[60vh] overflow-y-auto pr-1' : ''}`}>
                    {recentTransactions.map(transaction => {
                      const model = transaction.modelId 
                        ? models.find(m => m.id === transaction.modelId)
                        : null;
                      
                      return (
                        <div
                          key={transaction.id}
                          className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                            transaction.type === 'purchase' 
                              ? 'bg-green-100' 
                              : 'bg-blue-100'
                          )}>
                            {transaction.type === 'purchase' ? (
                              <CreditCard className="w-4 h-4 text-green-600" />
                            ) : (
                              <MessageSquare className="w-4 h-4 text-blue-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {transaction.type === 'purchase' ? '크레딧 구매' : '크레딧 사용'}
                            </p>
                            {model && (
                              <p className="text-xs text-gray-600">
                                {model.displayName}
                              </p>
                            )}
                            {transaction.credits && (
                              <p className="text-xs text-gray-500 truncate">
                                {Object.entries(transaction.credits)
                                  .map(([id, amount]) => {
                                    if (!amount || amount <= 0) return '';
                                    const m = models.find(model => model.id === id);
                                    return m ? `${m.displayName}: ${amount}회` : '';
                                  })
                                  .filter(Boolean)
                                  .join(', ')
                                }
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(transaction.timestamp).toLocaleString('ko-KR', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
