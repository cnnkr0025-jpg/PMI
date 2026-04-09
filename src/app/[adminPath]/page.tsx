import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';

const Admin = dynamic(() => import('@/components/Admin').then(mod => ({ default: mod.Admin })), {
  loading: () => <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div></div>,
  ssr: false,
});

export default async function SecretAdminPage({ params }: { params: Promise<{ adminPath: string }> | { adminPath: string } }) {
  const resolvedParams = await Promise.resolve(params);
  // 환경 변수에서 비밀 경로 가져오기
  const secretPath = process.env.ADMIN_SECRET_PATH;
  
  // 비밀 경로가 설정되지 않았거나 일치하지 않으면 404로 리다이렉트
  if (!secretPath || resolvedParams.adminPath !== secretPath) {
    notFound();
  }
  
  return <Admin />;
}
