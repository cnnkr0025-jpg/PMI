import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

// Header: ssr=false → 서버에서 인증상태 불일치로 생기는 auth-flash 완전 제거
const Header = dynamic(() => import('@/components/Header').then(mod => ({ default: mod.Header })), {
  ssr: false,
  loading: () => (
    <div
      className="app-header sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700"
      style={{ height: 56, background: 'var(--header-bg, #fff)' }}
      aria-hidden="true"
    />
  ),
});

// 비임계 컴포넌트는 클라이언트에서만 지연 로드 (초기 번들에서 완전 제외)
const SessionInitializer = dynamic(
  () => import('@/components/SessionInitializer').then(mod => ({ default: mod.SessionInitializer })),
  { ssr: false }
);
const ServiceWorkerRegistrar = dynamic(
  () => import('@/components/ServiceWorkerRegistrar').then(mod => ({ default: mod.ServiceWorkerRegistrar })),
  { ssr: false }
);

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Pick-My-AI - 커스텀 AI 선택 플랫폼',
  description: 'AI, 내가 고르고 내가 정한다. 원하는 모델 × 원하는 횟수 = 딱 그만큼만 결제',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
};

// ── 다크모드 초기화 스크립트 ──────────────────────────────────────────
// 첫 번째 페인트 전에 동기적으로 실행 → FOUC(깜빡임) 완전 제거
const THEME_INIT_SCRIPT = `(function(){
  try {
    var r=localStorage.getItem('pick-my-ai-storage');
    if(!r)return;
    var s=JSON.parse(r).state;
    var m=s&&s.themeSettings&&s.themeSettings.mode||'system';
    var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);
    if(d)document.documentElement.classList.add('dark');
    var c=(s&&s.themeSettings&&s.themeSettings.color)||(s&&s.currentUser&&s.currentUser.theme)||'blue';
    document.documentElement.setAttribute('data-theme',c);
  }catch(e){}
})();`;

// ── 적극적 프리페치 스크립트 ─────────────────────────────────────────
// ① hover/touch 즉시 프리페치  ② idle 시 핵심 라우트 선제 프리페치
const PREFETCH_SCRIPT = `(function(){
  var f=new Set(),n=navigator;
  function p(h){
    if(f.has(h))return;f.add(h);
    var l=document.createElement('link');
    l.rel='prefetch';l.href=h;l.as='document';
    document.head.appendChild(l);
  }
  var R=['/chat','/configurator','/dashboard','/checkout','/login','/guide','/feedback'];
  function onLink(e){
    var el=e.target&&e.target.closest('a[href]');
    if(!el)return;
    var h=el.getAttribute('href');
    if(h&&h[0]==='/'&&R.some(function(r){return h===r||h.startsWith(r+'/');}))p(h);
  }
  document.addEventListener('mouseover',onLink,{passive:true});
  document.addEventListener('touchstart',onLink,{passive:true});
  // idle 상태에서 핵심 라우트 선제 프리페치
  var idle=typeof requestIdleCallback!=='undefined'?requestIdleCallback:function(cb){setTimeout(cb,200)};
  idle(function(){
    // 세션 쿠키 유무로 로그인 상태 간이 판단 — 구매/대시보드 먼저(document prefetch 순서)
    var loggedIn=document.cookie.indexOf('session=')!==-1;
    var routes=loggedIn?['/configurator','/dashboard','/chat','/feedback']:['/guide','/login'];
    routes.forEach(p);
  },{timeout:400});
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* ① 다크모드: 첫 페인트 전 동기 실행 → 깜빡임 제로 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

        {/* ② 폰트 preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* ③ Supabase preconnect */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}

        {/* ④ AI API / 결제: dns-prefetch */}
        <link rel="dns-prefetch" href="https://api.openai.com" />
        <link rel="dns-prefetch" href="https://api.anthropic.com" />
        <link rel="dns-prefetch" href="https://api.perplexity.ai" />
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
        <link rel="dns-prefetch" href="https://js.toss.im" />

        {/* ⑤ 아이콘 preload */}
        <link rel="preload" href="/icon.svg" as="image" type="image/svg+xml" />
      </head>
      <body className={inter.className}>
        {/* ⑥ 프리페치 스크립트: idle 콜백으로 non-blocking */}
        <script dangerouslySetInnerHTML={{ __html: PREFETCH_SCRIPT }} />

        <ThemeProvider>
          <SessionInitializer />
          <ServiceWorkerRegistrar />
          <Header />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
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
