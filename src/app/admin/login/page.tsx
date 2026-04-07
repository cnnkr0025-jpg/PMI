'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/Card';
import { csrfFetch } from '@/lib/csrfFetch';
import { toast } from 'sonner';

type Step = 'password' | 'mfa';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH;
    const providedKey = searchParams.get('key');
    const canUseStaticAdminPath = secretPath === 'admin';

    if (!secretPath || (!canUseStaticAdminPath && (!providedKey || providedKey !== secretPath))) {
      router.replace('/404');
      return;
    }

    setIsAuthorized(true);
    setIsChecking(false);
  }, [searchParams, router]);

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const adminPathHeader = process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || 'admin';
      const response = await csrfFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-path': adminPathHeader },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || '로그인에 실패했습니다.');
        return;
      }

      if (data.mfaRequired) {
        setPendingToken(data.pendingToken);
        setStep('mfa');
        toast.info('MFA 코드를 입력해주세요.');
        return;
      }

      localStorage.setItem('adminAuthenticated', 'true');
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminTokenExpiry', (Date.now() + data.expiresIn).toString());
      toast.success('로그인 성공!');
      router.push(`/admin?key=${searchParams.get('key')}`);
    } catch {
      toast.error('로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const adminPathHeader = process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH || 'admin';
      const response = await csrfFetch('/api/admin/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-path': adminPathHeader },
        body: JSON.stringify({ pendingToken, code: mfaCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'MFA 인증에 실패했습니다.');
        setMfaCode('');
        return;
      }

      localStorage.setItem('adminAuthenticated', 'true');
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminTokenExpiry', (Date.now() + data.expiresIn).toString());
      toast.success('로그인 성공!');
      router.push(`/admin?key=${searchParams.get('key')}`);
    } catch {
      toast.error('MFA 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        {step === 'password' ? (
          <>
            <CardHeader className="space-y-1">
              <h2 className="text-2xl font-bold text-center">관리자 로그인</h2>
              <p className="text-center text-gray-500">관리자 비밀번호를 입력해주세요</p>
            </CardHeader>
            <form onSubmit={handlePasswordSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    placeholder="관리자 비밀번호를 입력하세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? '확인 중...' : '로그인'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
                  돌아가기
                </Button>
              </CardFooter>
            </form>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <h2 className="text-2xl font-bold text-center">2단계 인증</h2>
              <p className="text-center text-gray-500">
                인증 앱의 6자리 코드 또는 복구 코드(XXXX-XXXX)를 입력해주세요
              </p>
            </CardHeader>
            <form onSubmit={handleMfaSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-1">
                    인증 코드
                  </label>
                  <input
                    id="mfaCode"
                    type="text"
                    value={mfaCode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMfaCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="000000 또는 XXXX-XXXX"
                    maxLength={9}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center text-lg tracking-widest"
                  />
                </div>
                <p className="text-xs text-gray-400 text-center">코드는 30초마다 갱신됩니다</p>
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? '확인 중...' : '인증하기'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setStep('password'); setMfaCode(''); setPendingToken(''); }}
                >
                  비밀번호 다시 입력
                </Button>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
