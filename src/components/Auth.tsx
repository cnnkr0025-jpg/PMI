'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { getBaseUrl } from '@/lib/redirect';

interface AuthProps {
  onSuccess?: () => void;
  defaultMode?: 'login' | 'signup';
}

export const Auth: React.FC<AuthProps> = ({ onSuccess, defaultMode = 'login' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [agreedToMarketing, setAgreedToMarketing] = useState(false);

  const allRequired = agreedToTerms && agreedToPrivacy && confirmedAge;

  const handleGoogleLogin = useCallback(async () => {
    if (!allRequired) {
      toast.error('필수 항목에 모두 동의해주세요.');
      return;
    }

    setIsLoading(true);

    const tryOAuth = async () => {
      const redirectUrl = getBaseUrl();
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${redirectUrl}/auth/callback` },
      });
    };

    try {
      const { error } = await tryOAuth();

      if (error) {
        const isNetworkError = error.message?.toLowerCase().includes('network') || error.message?.toLowerCase().includes('fetch');

        if (isNetworkError) {
          // 이단계 대응 Stage 1: 네트워크 오류 시 1회 자동 재시도
          const stage1ToastId = toast.loading('연결에 문제가 발생했어요. 다시 시도합니다...', { duration: 6000 });
          await new Promise(r => setTimeout(r, 2000));
          toast.dismiss(stage1ToastId);

          try {
            const { error: retryError } = await tryOAuth();
            if (!retryError) return; // Stage 1 재시도 성공 (리다이렉트 진행 중)
            // Stage 2: 재시도도 실패
            toast.error('인터넷 연결을 확인하고 다시 시도해주세요.');
          } catch {
            toast.error('인터넷 연결을 확인하고 다시 시도해주세요.');
          }
        } else {
          // 이단계 대응 Stage 2: 비네트워크 오류는 구체적 메시지 표시
          toast.error(error.message || '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
        setIsLoading(false);
      }
    } catch (err: any) {
      // 이단계 대응 Stage 1: 예외 발생 시 1회 자동 재시도
      const stage1ToastId = toast.loading('로그인 중 문제가 발생했어요. 다시 시도합니다...', { duration: 6000 });
      await new Promise(r => setTimeout(r, 2000));
      toast.dismiss(stage1ToastId);

      try {
        const { error: retryError } = await tryOAuth();
        if (!retryError) return; // Stage 1 재시도 성공
        // Stage 2: 재시도 실패
        toast.error(retryError.message || '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
      } catch {
        // Stage 2: 최종 에러 표시
        toast.error(err.message || '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
      setIsLoading(false);
    }
  }, [allRequired]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-purple-50 to-pink-50 relative">
      {/* 상단 로고 */}
      <div className="absolute top-6 left-6 z-10">
        <a 
          href="/" 
          className="flex items-center space-x-3 hover:opacity-90 transition-all group"
        >
          <div className="w-11 h-11 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-all group-hover:scale-105">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold text-gray-900 tracking-tight">Pick-My-AI</span>
            <span className="text-xs text-gray-500 font-medium">AI 선택 플랫폼</span>
          </div>
        </a>
      </div>
      
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          {/* 중앙 로고 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 rounded-2xl shadow-xl mb-4">
              <Sparkles className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Pick-My-AI</h1>
            <p className="text-gray-600">AI, 내가 고르고 내가 정한다</p>
          </div>

        <Card variant="elevated" className="shadow-2xl border-2 border-white/50">
          <CardHeader>
            <h2 className="text-2xl font-bold mb-2 text-center">
              로그인 / 회원가입
            </h2>
            <p className="text-sm text-gray-500 text-center">
              소셜 계정으로 간편하게 시작하세요
            </p>
          </CardHeader>

          <CardContent className="p-6">
            {/* 구글 로그인 버튼 */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full flex items-center justify-center space-x-3 border-gray-300 hover:bg-gray-50 transition-all py-3"
              onClick={handleGoogleLogin}
              disabled={isLoading || !allRequired}
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent"></span>
                  <span className="text-gray-700">로그인 중...</span>
                </span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-gray-700 font-medium">Google로 계속하기</span>
                </>
              )}
            </Button>

            {/* 약관 동의 체크박스 (분리) */}
            <div className="mt-6 space-y-3">
              {/* 전체 동의 */}
              <label className="flex items-start space-x-3 cursor-pointer group border-b border-gray-200 pb-3">
                <input
                  type="checkbox"
                  checked={allRequired && agreedToMarketing}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreedToTerms(v);
                    setAgreedToPrivacy(v);
                    setConfirmedAge(v);
                    setAgreedToMarketing(v);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-gray-700">전체 동의</span>
              </label>

              {/* 이용약관 (필수) */}
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  <span className="text-red-500 font-bold">[필수]</span>{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>이용약관</a>에 동의합니다.
                </span>
              </label>

              {/* 개인정보처리방침 (필수) */}
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  <span className="text-red-500 font-bold">[필수]</span>{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>개인정보처리방침</a>에 동의합니다.
                </span>
              </label>

              {/* 만 14세 이상 확인 (필수) */}
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={confirmedAge}
                  onChange={(e) => setConfirmedAge(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  <span className="text-red-500 font-bold">[필수]</span> 만 14세 이상입니다.
                </span>
              </label>

              {/* 마케팅 수신 동의 (선택) */}
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToMarketing}
                  onChange={(e) => setAgreedToMarketing(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  <span className="text-gray-400 font-bold">[선택]</span> 마케팅 정보 수신에 동의합니다.
                </span>
              </label>

              {!allRequired && (
                <p className="text-xs text-gray-400 ml-7">
                  서비스 이용을 위해 필수 항목에 동의해주세요.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

