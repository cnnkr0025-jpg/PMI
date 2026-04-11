'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { initializeRealtimeSync, unsubscribeFromRealtimeUpdates } from '@/lib/realtimeSync';

/**
 * 앱 전역에서 세션 쿠키를 확인하여 Zustand store의 인증 상태를 자동 복원하는 컴포넌트.
 * layout.tsx에 배치하여 모든 페이지에서 인증 상태가 반영되도록 합니다.
 */
export function SessionInitializer() {
  const checkedRef = useRef(false);
  const routesWarmedRef = useRef(false);
  const router = useRouter();
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const isProtectedPath = Boolean(pathname && ['/chat', '/dashboard', '/settings', '/configurator', '/checkout', '/feedback'].some((route) => pathname.startsWith(route)));

  useEffect(() => {
    if (isAuthenticated || checkedRef.current) return;

    const run = async () => {
      if (checkedRef.current) return;
      checkedRef.current = true;

      try {
        // 세션 캐시: sessionStorage에서 5분 이내 결과 재사용 (API 재요청 제거)
        let sessionData: any = null;
        try {
          const cached = sessionStorage.getItem('__pma_session');
          if (cached) {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < 5 * 60 * 1000) {
              sessionData = data;
            } else {
              sessionStorage.removeItem('__pma_session');
            }
          }
        } catch {}

        if (!sessionData) {
          const res = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          });
          if (!res.ok) return;
          sessionData = await res.json();
          // 캐시 저장
          try {
            sessionStorage.setItem('__pma_session', JSON.stringify({ data: sessionData, ts: Date.now() }));
          } catch {}
        }

        const data = sessionData;
        if (data.authenticated && data.user) {
          const userId = data.user.id;

          // 로컬 트랜잭션 내역(UI 표시용)만 읽어둠 - 크레딧은 서버를 진실값으로 사용
          let savedLocalTransactions: any[] = [];
          let savedLocalHasFirstPurchase = false;
          try {
            const raw = localStorage.getItem('pick-my-ai-storage');
            if (raw) {
              const parsed = JSON.parse(raw);
              const ps = parsed?.state;
              if (ps) {
                const userWallet = ps[`user_${userId}_wallet`];
                if (userWallet?.transactions) savedLocalTransactions = userWallet.transactions;
                const userHfp = ps[`user_${userId}_hasFirstPurchase`];
                if (userHfp) savedLocalHasFirstPurchase = true;
              }
            }
          } catch { /* ignore */ }

          // 서버 데이터 로드 전 임시 상태 (크레딧은 비워둠 - 서버에서 받을 때까지)
          useStore.setState({
            currentUser: {
              id: userId,
              email: data.user.email,
              name: data.user.name,
              credits: 100,
              subscription: 'free' as const,
              theme: 'blue',
              createdAt: new Date(),
            },
            isAuthenticated: true,
            wallet: { userId, credits: {}, transactions: savedLocalTransactions },
            hasFirstPurchase: savedLocalHasFirstPurchase,
          });

          // 서버 데이터(지갑/설정) + 채팅 세션을 병렬로 로드
          const [userDataMod, chatSyncMod] = await Promise.all([
            import('@/lib/userDataSync').catch((err) => {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[SessionInitializer] userDataSync import failed:', err);
              }
              return null;
            }),
            import('@/lib/chatSync').catch((err) => {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[SessionInitializer] chatSync import failed:', err);
              }
              return null;
            }),
          ]);

          const [userData, sessionsResult] = await Promise.all([
            userDataMod ? userDataMod.loadUserData().catch((err) => {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[SessionInitializer] loadUserData failed:', err);
              }
              return null;
            }) : Promise.resolve(null),
            chatSyncMod ? chatSyncMod.ChatSyncService.loadChatSessions().catch((err) => {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[SessionInitializer] loadChatSessions failed:', err);
              }
              return null;
            }) : Promise.resolve(null),
          ]);

          // 사용자 데이터(지갑 + 설정) 처리
          try {
            if (userData) {
              const stateUpdate: Record<string, any> = {};

              // 서버 크레딧만 신뢰 (로컬값과 병합하지 않음)
              const serverCredits = userData.credits || {};
              const hasCredits = Object.keys(serverCredits).length > 0;

              stateUpdate.wallet = {
                userId,
                credits: serverCredits,
                transactions: savedLocalTransactions,
              };
              if (hasCredits || userData.settings?.hasFirstPurchase) {
                stateUpdate.hasFirstPurchase = true;
              }

              // 설정 복원
              if (userData.settings) {
                const s = userData.settings;
                if (s.selections?.length) stateUpdate.selections = s.selections;
                if (s.themeSettings) stateUpdate.themeSettings = s.themeSettings;
                if (s.personas?.length) stateUpdate.personas = s.personas;
                if (s.activePersona) stateUpdate.activePersona = s.activePersona;
                if (s.chatTemplates?.length) stateUpdate.chatTemplates = s.chatTemplates;
                if (s.favoriteTemplates?.length) stateUpdate.favoriteTemplates = s.favoriteTemplates;
                if (s.autoRecharge) stateUpdate.autoRecharge = s.autoRecharge;
                if (s.autoDelete) stateUpdate.autoDelete = s.autoDelete;
                if (s.streaming) stateUpdate.streaming = s.streaming;
                if (s.aiGrowthData) stateUpdate.aiGrowthData = s.aiGrowthData;
                if (s.expertiseProfiles?.length) stateUpdate.expertiseProfiles = s.expertiseProfiles;
                if (s.activeExpertise) stateUpdate.activeExpertise = s.activeExpertise;
                if (s.pmcBalance) stateUpdate.pmcBalance = s.pmcBalance;
                if (s.userPlan) stateUpdate.userPlan = s.userPlan;
                if (s.storedFacts?.length) stateUpdate.storedFacts = s.storedFacts;
                if (s.usageAlerts?.length) stateUpdate.usageAlerts = s.usageAlerts;
                if (s.comparisonSessions?.length) stateUpdate.comparisonSessions = s.comparisonSessions;
                if (s.customDesignTheme) stateUpdate.customDesignTheme = s.customDesignTheme;
                if (s.settings) stateUpdate.settings = s.settings;
                if (s.language) stateUpdate.language = s.language;
                if (s.hasFirstPurchase) stateUpdate.hasFirstPurchase = s.hasFirstPurchase;
              }

              if (Object.keys(stateUpdate).length > 0) {
                useStore.setState(stateUpdate);
              }
            }
          } catch {
            // 서버 데이터 로드 실패 시 무시 (로컬 데이터 사용)
          }

          // 채팅 세션 로드 (서버 세션과 로컬 세션 병합)
          try {
            if (sessionsResult && sessionsResult.success && sessionsResult.sessions) {
              const serverSessions = sessionsResult.sessions;
              
              // 로컬 세션 가져오기 (localStorage에서 직접 + store에서)
              let localSessions: any[] = useStore.getState().chatSessions || [];
              if (localSessions.length === 0) {
                try {
                  const raw = localStorage.getItem('pick-my-ai-storage');
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    const ps = parsed?.state;
                    const userSessions = ps?.[`user_${userId}_chatSessions`];
                    if (Array.isArray(userSessions) && userSessions.length > 0) {
                      localSessions = userSessions;
                    }
                  }
                } catch { /* ignore */ }
              }
              
              // 서버/로컬 동일 ID 세션 병합: 더 최신(updatedAt) 또는 메시지 많은 쪽 우선
              if (serverSessions.length > 0) {
                const merged = serverSessions.map((serverSession: any) => {
                  const localMatch = localSessions.find((s: any) => s.id === serverSession.id);
                  if (!localMatch) return serverSession;

                  const serverUpdated = serverSession.updatedAt ? new Date(serverSession.updatedAt).getTime() : 0;
                  const localUpdated = localMatch.updatedAt ? new Date(localMatch.updatedAt).getTime() : 0;
                  const serverMsgCount = Array.isArray(serverSession.messages) ? serverSession.messages.length : 0;
                  const localMsgCount = Array.isArray(localMatch.messages) ? localMatch.messages.length : 0;

                  // 더 최근 updatedAt, 동률이면 메시지 수가 많은 쪽
                  if (localUpdated > serverUpdated) return localMatch;
                  if (localUpdated < serverUpdated) return serverSession;
                  return localMsgCount > serverMsgCount ? localMatch : serverSession;
                });

                const serverIds = new Set(serverSessions.map((s: any) => s.id));
                const localOnly = localSessions.filter((s: any) => !serverIds.has(s.id));
                useStore.setState({ chatSessions: [...merged, ...localOnly] });
              }
              // 서버가 비어있으면 로컬 세션 유지 (덮어쓰지 않음)
            }
          } catch {
            // 채팅 세션 로드 실패 시 무시 (로컬 데이터 유지)
          }

          // Realtime 구독 초기화
          initializeRealtimeSync(userId);
        }
      } catch {
        // 세션 확인 실패 시 무시 (비로그인 상태 유지)
      }
    };

    let cancelFn: (() => void) | null = null;

    if (isProtectedPath) {
      // 보호된 경로: 즉시 실행
      void run();
    } else if (typeof (window as any).requestIdleCallback !== 'undefined') {
      // 유휴 상태에서 실행 (메인 스레드 점유 최소화)
      const id = (window as any).requestIdleCallback(() => { void run(); }, { timeout: 1500 });
      cancelFn = () => (window as any).cancelIdleCallback(id);
    } else {
      // 폴백: 600ms 후 실행
      const id = setTimeout(() => { void run(); }, 600);
      cancelFn = () => clearTimeout(id);
    }

    return () => { cancelFn?.(); };
  }, [isAuthenticated, isProtectedPath]);

  // 로그인 직후(또는 세션 복원 직후) 구매·대시보드·채팅 RSC·JS 청크 선제 로드 → 탭 클릭 체감 속도
  useEffect(() => {
    if (!isAuthenticated) {
      routesWarmedRef.current = false;
      return;
    }
    if (routesWarmedRef.current) return;
    routesWarmedRef.current = true;

    router.prefetch('/configurator');
    router.prefetch('/dashboard');
    router.prefetch('/chat');
    router.prefetch('/feedback');
    router.prefetch('/settings');

    void Promise.all([
      import('@/components/Configurator'),
      import('@/components/Dashboard'),
      import('@/components/Chat'),
    ]);
  }, [isAuthenticated, router]);

  // 컴포넌트 언마운트 시 Realtime 구독 해제
  useEffect(() => {
    return () => {
      unsubscribeFromRealtimeUpdates();
    };
  }, []);

  return null;
}
