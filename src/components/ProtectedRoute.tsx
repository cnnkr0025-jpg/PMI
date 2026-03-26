'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth, useAuthActions } from '@/hooks/useAuthStore';
import { redirectToLogin } from '@/lib/redirect';

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

    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
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
        } else {
          setIsAuthenticated(false);
          redirectToLogin();
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        redirectToLogin();
      });
  }, [isAuthenticated, setCurrentUser, setIsAuthenticated]);

  // 미들웨어 통과 = JWT 유효 → children 즉시 렌더 (로딩 화면 없음)
  return <>{children}</>;
};
