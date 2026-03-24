'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const Admin = dynamic(() => import('@/components/Admin').then(mod => ({ default: mod.Admin })), {
  loading: () => <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div></div>,
  ssr: false,
});

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_SECRET_PATH;
    const providedKey = searchParams.get('key');
    const canUseStaticAdminPath = secretPath === 'admin';

    // 비밀 경로가 설정되지 않았거나 키가 일치하지 않으면 404로 리다이렉트
    if (!secretPath || (!canUseStaticAdminPath && (!providedKey || providedKey !== secretPath))) {
      router.replace('/404');
      return;
    }

    setIsAuthorized(true);
    setIsChecking(false);
  }, [searchParams, router]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <Admin />;
}

