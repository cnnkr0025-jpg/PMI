import { supabase } from './supabase';
import { useStore } from '@/store';
import type { RealtimeChannel } from '@supabase/supabase-js';

let walletChannel: RealtimeChannel | null = null;
let transactionsChannel: RealtimeChannel | null = null;
let settingsChannel: RealtimeChannel | null = null;

export const subscribeToWalletUpdates = (userId: string) => {
  if (!userId) return;

  // 기존 구독 정리
  if (walletChannel) {
    supabase.removeChannel(walletChannel);
    walletChannel = null;
  }

  // user_wallets 테이블 변경 구독
  walletChannel = supabase
    .channel(`wallet:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_wallets',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log('💰 Wallet update received:', payload);
          }

          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newData = payload.new as any;
            const currentState = useStore.getState();
            const newCredits = newData?.credits;

            if (newCredits) {
              if (currentState.wallet) {
                useStore.setState({
                  wallet: {
                    ...currentState.wallet,
                    credits: newCredits,
                  },
                });
              } else {
                // wallet이 아직 초기화되지 않은 경우 새로 생성
                useStore.setState({
                  wallet: {
                    userId,
                    credits: newCredits,
                    transactions: [],
                  },
                });
              }
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[realtimeSync] Wallet callback error:', e);
          }
        }
      }
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('💰 Wallet subscription status:', status);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // 재연결: 5초 후 재시도
        setTimeout(() => subscribeToWalletUpdates(userId), 5000);
      }
    });
};

export const subscribeToTransactionUpdates = (userId: string) => {
  if (!userId) return;

  // 기존 구독 정리
  if (transactionsChannel) {
    supabase.removeChannel(transactionsChannel);
    transactionsChannel = null;
  }

  // transactions 테이블 변경 구독
  transactionsChannel = supabase
    .channel(`transactions:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log('📊 Transaction update received:', payload);
          }

          const newTransaction = payload.new as any;
          if (!newTransaction?.id) return;

          const currentState = useStore.getState();
          
          if (currentState.wallet) {
            const existingTransaction = currentState.wallet.transactions?.find(
              (t) => t.id === newTransaction.id
            );

            if (!existingTransaction) {
              useStore.setState({
                wallet: {
                  ...currentState.wallet,
                  transactions: [
                    ...(currentState.wallet.transactions || []),
                    {
                      id: newTransaction.id,
                      userId: newTransaction.user_id || currentState.wallet.userId,
                      type: newTransaction.type,
                      modelId: newTransaction.model_id,
                      amount: newTransaction.amount,
                      timestamp: newTransaction.created_at,
                      description: newTransaction.description,
                    },
                  ],
                },
              });
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[realtimeSync] Transaction callback error:', e);
          }
        }
      }
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('📊 Transactions subscription status:', status);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setTimeout(() => subscribeToTransactionUpdates(userId), 5000);
      }
    });
};

export const subscribeToSettingsUpdates = (userId: string) => {
  if (!userId) return;

  // 기존 구독 정리
  if (settingsChannel) {
    supabase.removeChannel(settingsChannel);
    settingsChannel = null;
  }

  // user_settings 테이블 변경 구독 (플랜 변경, PMC 잔액 등)
  settingsChannel = supabase
    .channel(`settings:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_settings',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log('⚙️ Settings update received:', payload);
          }

          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newData = payload.new as any;
            const settingsData = newData?.data;
            if (!settingsData) return;

            const stateUpdate: Record<string, any> = {};

            // 플랜 변경 반영
            if (settingsData.userPlan !== undefined) {
              stateUpdate.userPlan = settingsData.userPlan;
            }

            // PMC 잔액 변경 반영
            if (settingsData.pmcBalance !== undefined) {
              stateUpdate.pmcBalance = settingsData.pmcBalance;
            }

            if (Object.keys(stateUpdate).length > 0) {
              useStore.setState(stateUpdate);
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[realtimeSync] Settings callback error:', e);
          }
        }
      }
    )
    .subscribe((status) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚙️ Settings subscription status:', status);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setTimeout(() => subscribeToSettingsUpdates(userId), 5000);
      }
    });
};

export const unsubscribeFromRealtimeUpdates = () => {
  if (walletChannel) {
    supabase.removeChannel(walletChannel);
    walletChannel = null;
  }

  if (transactionsChannel) {
    supabase.removeChannel(transactionsChannel);
    transactionsChannel = null;
  }

  if (settingsChannel) {
    supabase.removeChannel(settingsChannel);
    settingsChannel = null;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Unsubscribed from all realtime updates');
  }
};

export const initializeRealtimeSync = (userId: string) => {
  if (!userId) return;

  if (process.env.NODE_ENV !== 'production') {
    console.log('Initializing realtime sync for user:', userId);
  }

  subscribeToWalletUpdates(userId);
  subscribeToTransactionUpdates(userId);
  subscribeToSettingsUpdates(userId);
};
