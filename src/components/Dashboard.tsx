'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { 
  MessageSquare,
  AlertCircle,
  Plus,
  ArrowRight,
  Bookmark,
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
  
  if (!wallet) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="max-w-sm w-full px-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">크레딧이 없습니다</h2>
          <p className="text-sm text-gray-500 mb-6">AI 모델을 사용하려면 먼저 크레딧을 구매해주세요.</p>
          <button
            onClick={handleRefill}
            className="dashboard-buy-credit-button inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            크레딧 구매하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* 페이지 헤더 */}
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">{t.dashboard.title}</h1>
          <p className="text-gray-500">{t.dashboard.description}</p>
        </div>

        {/* 빠른 액션 */}
        <div className="flex items-center gap-3 mb-12">
          <button
            onClick={handleStartChat}
            className="dashboard-start-chat-button inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {t.dashboard.startChat}
          </button>
          <button
            onClick={handleRefill}
            className="dashboard-buy-credit-button inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.dashboard.buyCreditsButton}
          </button>
        </div>

        {/* 크레딧 요약 */}
        <div className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">크레딧 현황</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-white px-6 py-5">
              <p className="text-xs text-gray-500 mb-2">{t.dashboard.pmcBalance}</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">{availablePMC.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">{t.dashboard.pmcRate}</p>
            </div>
            <div className="bg-white px-6 py-5">
              <p className="text-xs text-gray-500 mb-2">{t.dashboard.pmcSaved}</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">{formatWon(savedAmount)}</p>
              <p className="text-xs text-gray-400 mt-1">누적 절약</p>
            </div>
            <div className="dashboard-credit-card bg-white px-6 py-5">
              <p className="text-xs text-gray-500 mb-2">{t.dashboard.remainingCredits}</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">{creditStats.remaining}</p>
              <p className="text-xs text-gray-400 mt-1">잔여 / 전체 {creditStats.total}</p>
            </div>
            <div className="dashboard-chat-card bg-white px-6 py-5">
              <p className="text-xs text-gray-500 mb-2">{t.dashboard.totalChats}</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">{chatSessions.length}</p>
              <p className="text-xs text-gray-400 mt-1">총 대화 수</p>
            </div>
          </div>

          {creditStats.remaining < 10 && creditStats.remaining > 0 && (
            <div className="mt-4 flex items-start gap-3 p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">{t.dashboard.lowCredits}</p>
                <p className="text-sm text-amber-700 mt-0.5">{t.dashboard.refillCredits}</p>
              </div>
            </div>
          )}
        </div>

        {/* 모델별 사용 현황 + 최근 내역 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* 모델별 크레딧 */}
          <div className="dashboard-usage-card lg:col-span-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">{t.dashboard.modelCredits}</h2>
            {creditStats.models.filter(s => s.remaining > 0).length === 0 ? (
              <p className="text-sm text-gray-400">{t.dashboard.noModelCredits}</p>
            ) : (
              <div className="space-y-5">
                {creditStats.models.filter(s => s.remaining > 0).map(stat => (
                  <div key={stat.model.id}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-700">{stat.model.displayName}</span>
                      <span className="text-sm tabular-nums text-gray-500">
                        {stat.remaining}<span className="text-gray-300 mx-1">/</span>{stat.total}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all duration-500"
                        style={{ width: `${100 - stat.usageRate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 최근 활동 */}
          <div className="dashboard-activity-card lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{t.dashboard.recentActivity}</h2>
              {allTransactions.length > 5 && (
                <button
                  onClick={() => setShowAllActivity(!showAllActivity)}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                >
                  {showAllActivity ? '접기' : '전체 보기'}
                  {!showAllActivity && <ArrowRight className="w-3 h-3" />}
                </button>
              )}
            </div>
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-400">{t.dashboard.noActivity}</p>
            ) : (
              <div className={cn('space-y-4', showAllActivity && 'max-h-96 overflow-y-auto')}>
                {recentTransactions.map(transaction => {
                  const model = transaction.modelId
                    ? models.find(m => m.id === transaction.modelId)
                    : null;
                  const isPurchase = transaction.type === 'purchase';
                  return (
                    <div key={transaction.id} className="flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border',
                        isPurchase ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
                      )}>
                        {isPurchase
                          ? <Plus className="w-3 h-3 text-gray-500" />
                          : <MessageSquare className="w-3 h-3 text-gray-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium leading-tight">
                          {isPurchase ? '크레딧 구매' : '크레딧 사용'}
                        </p>
                        {model && <p className="text-xs text-gray-500 mt-0.5">{model.displayName}</p>}
                        {!model && transaction.credits && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {Object.entries(transaction.credits)
                              .map(([id, amount]) => {
                                if (!amount || amount <= 0) return '';
                                const m = models.find(mo => mo.id === id);
                                return m ? `${m.displayName} ${amount}회` : '';
                              })
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">
                          {new Date(transaction.timestamp).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
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

        {/* 저장된 답변 */}
        <div className="mt-12 pt-12 border-t border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">저장된 답변</h2>
            {bookmarkedMessages.length > 0 && (
              <button
                onClick={() => router.push('/chat')}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                채팅에서 보기 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {bookmarkedMessages.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <Bookmark className="w-4 h-4 text-gray-300" />
              <p className="text-sm text-gray-400">저장된 답변이 없습니다. 채팅에서 북마크를 눌러 저장하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookmarkedMessages.slice(0, 3).map(bm => (
                <div
                  key={bm.id}
                  className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer group"
                  onClick={() => router.push('/chat')}
                >
                  <Bookmark className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors mt-1 flex-shrink-0" />
                  <p className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors line-clamp-2 leading-relaxed">
                    {bm.content.slice(0, 120)}{bm.content.length > 120 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
