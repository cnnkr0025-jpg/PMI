'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth, useAuthActions } from '@/hooks/useAuthStore';
import { redirectToLogin } from '@/lib/redirect';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * 미들웨어가 이미 JWT를 검증하고 통과시킨 요청이므로
 * children을 즉시 렌더링하고, 백그라운드에서 세션을 확인합니다.
 * 세션이 무효화된 경우에만 리다이렉트합니다.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { setCurrentUser, setIsAuthenticated } = useAuthActions();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const checkSession = () =>
      fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null));

    checkSession()
      .then(async (data) => {
        if (data?.authenticated && data.user) {
          setCurrentUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            credits: 100,
            subscription: 'free',
            theme: 'blue',
            createdAt: new Date(),
          });
          setIsAuthenticated(true);
        } else if (data === null) {
          // 이단계 대응 Stage 1: 응답은 왔지만 세션 없음 → 1회 재확인
          const stage1ToastId = toast.loading('세션을 확인하는 중...', { duration: 5000 });
          await new Promise(r => setTimeout(r, 1500));
          toast.dismiss(stage1ToastId);
          try {
            const retryData = await checkSession();
            if (retryData?.authenticated && retryData.user) {
              setCurrentUser({
                id: retryData.user.id,
                email: retryData.user.email,
                name: retryData.user.name,
                credits: 100,
                subscription: 'free',
                theme: 'blue',
                createdAt: new Date(),
              });
              setIsAuthenticated(true);
            } else {
              // Stage 2: 세션 만료 안내 후 이동
              toast.error('세션이 만료되었습니다. 다시 로그인해주세요.');
              setTimeout(() => {
                setIsAuthenticated(false);
                redirectToLogin();
              }, 1200);
            }
          } catch {
            toast.error('세션 확인 중 오류가 발생했습니다. 다시 로그인해주세요.');
            setTimeout(() => {
              setIsAuthenticated(false);
              redirectToLogin();
            }, 1200);
          }
        } else {
          setIsAuthenticated(false);
          redirectToLogin();
        }
      })
      .catch(async () => {
        // 이단계 대응 Stage 1: 네트워크 오류 시 1회 재시도
        const stage1ToastId = toast.loading('연결을 확인하는 중...', { duration: 6000 });
        await new Promise(r => setTimeout(r, 2000));
        toast.dismiss(stage1ToastId);
        try {
          const retryData = await checkSession();
          if (retryData?.authenticated && retryData.user) {
            setCurrentUser({
              id: retryData.user.id,
              email: retryData.user.email,
              name: retryData.user.name,
              credits: 100,
              subscription: 'free',
              theme: 'blue',
              createdAt: new Date(),
            });
            setIsAuthenticated(true);
          } else {
            // Stage 2: 최종 실패 안내
            toast.error('세션이 만료되었습니다. 다시 로그인해주세요.');
            setTimeout(() => {
              setIsAuthenticated(false);
              redirectToLogin();
            }, 1200);
          }
        } catch {
          toast.error('연결 오류가 발생했습니다. 다시 로그인해주세요.');
          setTimeout(() => {
            setIsAuthenticated(false);
            redirectToLogin();
          }, 1200);
        }
      });
  }, [isAuthenticated, setCurrentUser, setIsAuthenticated]);

  // 미들웨어 통과 = JWT 유효 → children 즉시 렌더 (로딩 화면 없음)
  return <>{children}</>;
};
