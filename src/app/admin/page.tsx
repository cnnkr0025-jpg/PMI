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
    const providedKey = searchParams.get('key');
    fetch('/api/admin/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { router.replace('/404'); return; }
        const secretPath: string = data.adminPath || '';
        const canUseStaticAdminPath = secretPath === 'admin';
        if (!secretPath || (!canUseStaticAdminPath && (!providedKey || providedKey !== secretPath))) {
          router.replace('/404');
          return;
        }
        setIsAuthorized(true);
        setIsChecking(false);
      })
      .catch(() => router.replace('/404'));
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

