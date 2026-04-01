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
  Star,
  ChevronRight
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* 헤더 */}
        <div className="mb-10 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">{t.dashboard.title}</h1>
            <p className="text-gray-500 text-sm">{t.dashboard.description}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleStartChat}
              className="dashboard-start-chat-button px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              {t.dashboard.startChat}
            </button>
            <button
              onClick={handleRefill}
              className="dashboard-buy-credit-button px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t.dashboard.buyCreditsButton}
            </button>
          </div>
        </div>
        
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {/* PMC 잔액 카드 */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{t.dashboard.pmcBalance}</p>
              <Coins className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{availablePMC.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{t.dashboard.pmcRate}</p>
          </div>
          
          {/* PMC로 아낀 금액 카드 */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{t.dashboard.pmcSaved}</p>
              <Sparkles className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{formatWon(savedAmount)}</p>
            <p className="text-xs text-gray-500">{t.dashboard.pmcRate}</p>
          </div>
          
          <div className="dashboard-credit-card bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{t.dashboard.totalCredits}</p>
              <CreditCard className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{creditStats.total}</p>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{t.dashboard.usedCredits}</p>
              <TrendingUp className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{creditStats.used}</p>
          </div>
          
          <div className="dashboard-chat-card bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{t.dashboard.totalChats}</p>
              <MessageSquare className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold text-gray-900 mb-1">{chatSessions.length}</p>
          </div>
        </div>
        
        {/* 북마크 요약 */}
        <div className="mb-10">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-700">저장된 답변</h3>
            </div>
            {bookmarkedMessages.length === 0 ? (
              <p className="text-sm text-gray-500">저장된 답변이 없습니다. 채팅에서 북마크 버튼을 눌러 저장하세요.</p>
            ) : (
              <>
                <p className="text-xl font-semibold text-gray-900 mb-3">{bookmarkedMessages.length}개</p>
                <div className="space-y-2 mb-4">
                  {bookmarkedMessages.slice(0, 2).map(bm => (
                    <div key={bm.id} className="p-3 bg-gray-50 rounded-md border border-gray-100">
                      <p className="text-sm text-gray-600 truncate">{bm.content.slice(0, 80)}...</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => router.push('/chat')}
                  className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors flex items-center gap-1"
                >
                  채팅에서 보기 <ChevronRight className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 모델별 크레딧 현황 */}
          <div className="lg:col-span-2">
            <div className="dashboard-usage-card bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-medium text-gray-900">{t.dashboard.modelCredits}</h2>
                <BarChart3 className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                {creditStats.models.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-500 text-sm">{t.dashboard.noModelCredits}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {creditStats.models.filter(stat => stat.remaining > 0).map(stat => (
                      <div key={stat.model.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-700">{stat.model.displayName}</h4>
                          <span className="text-sm text-gray-500 tabular-nums">
                            {stat.remaining} / {stat.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={cn('h-full bg-gray-900 transition-all')}
                            style={{ width: `${stat.usageRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {creditStats.remaining < 10 && creditStats.remaining > 0 && (
                  <div className="mt-8 p-4 bg-gray-50 rounded-lg flex items-start space-x-3 border border-gray-200">
                    <AlertCircle className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">
                        {t.dashboard.lowCredits}
                      </p>
                      <p className="text-gray-500 mt-1">
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
            <div className="dashboard-activity-card bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-medium text-gray-900">{t.dashboard.recentActivity}</h2>
                {allTransactions.length > 5 && (
                  <button
                    onClick={() => setShowAllActivity(!showAllActivity)}
                    className="text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors"
                  >
                    {showAllActivity ? '최근 내역' : '전체 보기'}
                  </button>
                )}
              </div>
              <div>
                {recentTransactions.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-500 text-sm">{t.dashboard.noActivity}</p>
                  </div>
                ) : (
                  <div className={`space-y-4 ${showAllActivity ? 'max-h-[60vh] overflow-y-auto pr-2' : ''}`}>
                    {recentTransactions.map(transaction => {
                      const model = transaction.modelId 
                        ? models.find(m => m.id === transaction.modelId)
                        : null;
                      
                      return (
                        <div
                          key={transaction.id}
                          className="flex items-start space-x-3 group"
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border',
                            transaction.type === 'purchase' 
                              ? 'bg-gray-50 border-gray-200' 
                              : 'bg-white border-gray-200'
                          )}>
                            {transaction.type === 'purchase' ? (
                              <Plus className="w-3.5 h-3.5 text-gray-600" />
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5 text-gray-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-sm font-medium text-gray-900 leading-none">
                              {transaction.type === 'purchase' ? '크레딧 구매' : '크레딧 사용'}
                            </p>
                            {model && (
                              <p className="text-xs text-gray-500 mt-1">
                                {model.displayName}
                              </p>
                            )}
                            {transaction.credits && (
                              <p className="text-xs text-gray-500 mt-1 truncate">
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
                            <p className="text-[11px] text-gray-400 mt-1.5">
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
