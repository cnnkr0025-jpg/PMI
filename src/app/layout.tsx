import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SessionInitializer } from '@/components/SessionInitializer';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import './globals.css';

// 동적 임포트로 초기 로딩 최적화
const Header = dynamic(() => import('@/components/Header').then(mod => ({ default: mod.Header })), {
  ssr: true,
  loading: () => <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700" />
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Pick-My-AI - 커스텀 AI 선택 플랫폼',
  description: 'AI, 내가 고르고 내가 정한다. 원하는 모델 × 원하는 횟수 = 딱 그만큼만 결제',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트: 초기 렌더링에 필요 → preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Supabase: 인증에 즉시 사용 → preconnect */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
        {/* AI API / 결제: 채팅·결제 시점에 연결 → dns-prefetch만으로 충분 */}
        <link rel="dns-prefetch" href="https://api.openai.com" />
        <link rel="dns-prefetch" href="https://api.anthropic.com" />
        <link rel="dns-prefetch" href="https://api.perplexity.ai" />
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
        <link rel="dns-prefetch" href="https://js.toss.im" />
        {/* 예측적 프리페치: 마우스 hover 시 해당 페이지 JS 미리 로드 */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  var prefetched = new Set();
  var ROUTES = ['/chat','/configurator','/dashboard','/checkout','/login','/guide'];
  function prefetch(href){
    if(prefetched.has(href)) return;
    prefetched.add(href);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    document.head.appendChild(link);
  }
  document.addEventListener('mouseover', function(e){
    var el = e.target && e.target.closest('a[href]');
    if(!el) return;
    var href = el.getAttribute('href');
    if(href && href.startsWith('/') && ROUTES.some(function(r){ return href === r || href.startsWith(r+'/'); })){
      prefetch(href);
    }
  }, {passive: true});
  // 터치 디바이스: touchstart 시 프리페치
  document.addEventListener('touchstart', function(e){
    var el = e.target && e.target.closest('a[href]');
    if(!el) return;
    var href = el.getAttribute('href');
    if(href && href.startsWith('/') && ROUTES.some(function(r){ return href === r || href.startsWith(r+'/'); })){
      prefetch(href);
    }
  }, {passive: true});
})();
        ` }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <ServiceWorkerRegistrar />
          <SessionInitializer />
          <Header />
          {children}
          <Toaster 
            position="bottom-center"
            closeButton
            toastOptions={{
              classNames: {
                toast: 'dark:bg-gray-800 dark:text-white dark:border-gray-700',
                cancelButton: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200',
                actionButton: 'bg-primary text-primary-foreground hover:opacity-90',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

