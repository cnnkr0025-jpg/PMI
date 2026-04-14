'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User as UserIcon, LogOut, Vote, Globe, Info, ShieldCheck, MessageSquare } from 'lucide-react';
import { useStore } from '@/store';
import { Button } from './ui/Button';
import { LogoMark } from './LogoMark';

// 모달은 열릴 때만 동적 로드
import dynamic from 'next/dynamic';
const PollModal = dynamic(() => import('./PollModal').then((m) => ({ default: m.PollModal })), { ssr: false });
const PMCInfoModal = dynamic(() => import('./PMCInfoModal').then((m) => ({ default: m.PMCInfoModal })), { ssr: false });

export const Header = React.memo(() => {
  const pathname = usePathname();
  const router = useRouter();

  // 개별 선택자로 구독 → 관련 없는 상태 변경 시 리렌더 방지
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);
  const activePolls = useStore((s) => s.activePolls);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);

  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isPMCInfoOpen, setIsPMCInfoOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !languageMenuRef.current) return;
      if (!languageMenuRef.current.contains(target)) {
        setIsLanguageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [isLanguageMenuOpen]);

  const ui = useMemo(() => {
    if (language === 'en') {
      return {
        chat: 'Chat', configurator: 'Buy AI Models', dashboard: 'Dashboard',
        feedback: 'Feedback', vote: 'Vote', logout: 'Logout',
        language: 'Language', korean: 'Korean', english: 'English', japanese: 'Japanese',
      };
    }
    if (language === 'ja') {
      return {
        chat: 'チャット', configurator: 'AIモデル購入', dashboard: 'ダッシュボード',
        feedback: 'フィードバック', vote: '投票', logout: 'ログアウト',
        language: '言語', korean: '韓国語', english: '英語', japanese: '日本語',
      };
    }
    return {
      chat: '채팅', configurator: 'AI 모델 구매', dashboard: '대시보드',
      feedback: '의견 보내기', vote: '투표', logout: '로그아웃',
      language: '언어', korean: '한국어', english: '영어', japanese: '일본어',
    };
  }, [language]);

  const unvotedPollsCount = useMemo(() => {
    if (!currentUser) return 0;
    return activePolls.filter((poll) => !poll.votes.some((v) => v.userId === currentUser.id)).length;
  }, [activePolls, currentUser]);

  const shouldHideHeader = useMemo(() => pathname === '/' || pathname === '/login', [pathname]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/messages?count=true', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnreadMessageCount(data.unreadCount ?? 0);
      } catch {
        // 네트워크 오류 무시
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAuthenticated]);

  const handleLogout = useCallback(() => {
    logout();
    router.push('/');
  }, [logout, router]);

  const handlePollClose = useCallback(() => setIsPollModalOpen(false), []);
  const handlePMCClose = useCallback(() => setIsPMCInfoOpen(false), []);

  if (shouldHideHeader) return null;

  return (
    <header className="app-header sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-90 transition-all">
            <div className="preview-nav-logo flex h-9 w-9 items-center justify-center rounded-lg bg-transparent">
              <LogoMark className="h-9 w-9" />
            </div>
            <span className="preview-nav-title text-lg font-semibold text-gray-900 dark:text-white">Pick-My-AI</span>
          </Link>

          <div className="flex items-center space-x-1">
            {isAuthenticated && currentUser ? (
              <>
                <Link
                  href="/chat"
                  prefetch
                  onMouseEnter={() => { router.prefetch('/chat'); void import('@/components/Chat'); }}
                  onTouchStart={() => { router.prefetch('/chat'); void import('@/components/Chat'); }}
                  className={`preview-nav-chat-tab px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/chat' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  {ui.chat}
                </Link>
                <Link
                  href="/configurator"
                  prefetch
                  onMouseEnter={() => { router.prefetch('/configurator'); void import('@/components/Configurator'); }}
                  onTouchStart={() => { router.prefetch('/configurator'); void import('@/components/Configurator'); }}
                  className={`preview-nav-home-tab px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/configurator' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  {ui.configurator}
                </Link>
                <Link
                  href="/dashboard"
                  prefetch
                  onMouseEnter={() => { router.prefetch('/dashboard'); void import('@/components/Dashboard'); }}
                  onTouchStart={() => { router.prefetch('/dashboard'); void import('@/components/Dashboard'); }}
                  className={`preview-nav-dashboard-tab px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/dashboard' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  {ui.dashboard}
                </Link>
                <Link
                  href="/feedback"
                  prefetch
                  onMouseEnter={() => router.prefetch('/feedback')}
                  onTouchStart={() => router.prefetch('/feedback')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/feedback' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >{ui.feedback}</Link>
                <Link
                  href="/guide"
                  prefetch
                  onMouseEnter={() => router.prefetch('/guide')}
                  onTouchStart={() => router.prefetch('/guide')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/guide' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >가이드</Link>
                <button
                  onClick={() => setIsPollModalOpen(true)}
                  className="px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white flex items-center gap-1 relative"
                >
                  <Vote className="w-4 h-4" />
                  {ui.vote}
                  {unvotedPollsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {unvotedPollsCount}
                    </span>
                  )}
                </button>
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                <button type="button" onClick={() => setIsPMCInfoOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="PMC 정보">
                  <Info className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
                <Link href="/security" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="보안 정책">
                  <ShieldCheck className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </Link>
                <Link href="/messages" className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="메시지">
                  <MessageSquare className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                    </span>
                  )}
                </Link>
                <div className="relative" ref={languageMenuRef}>
                  <button type="button" onClick={() => setIsLanguageMenuOpen((prev) => !prev)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={ui.language}>
                    <Globe className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </button>
                  {isLanguageMenuOpen && (
                    <div className="absolute right-0 mt-2 w-40 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                      {(['ko', 'en', 'ja'] as const).map((lang) => (
                        <button key={lang} type="button" onClick={() => { setLanguage(lang); setIsLanguageMenuOpen(false); }} className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${language === lang ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                          {lang === 'ko' ? ui.korean : lang === 'en' ? ui.english : ui.japanese}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Link href="/settings" className="preview-nav-settings-tab p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={currentUser.name}>
                  <UserIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2" title={ui.logout}>
                  <LogOut className="w-5 h-5" />
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/guide"
                  prefetch
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/guide' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                >가이드</Link>
                <Link
                  href="/security"
                  className={`p-2 rounded-lg transition-colors ${pathname === '/security' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                  title="보안 정책"
                >
                  <ShieldCheck className="w-5 h-5" />
                </Link>
                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                <Link href="/login" className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors">로그인</Link>
                <Link href="/login" className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:opacity-90 transition-all">회원가입</Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 모달: 열릴 때만 마운트 (초기 번들/렌더 비용 제거) */}
      {isPollModalOpen && <PollModal isOpen={true} onClose={handlePollClose} />}
      {isPMCInfoOpen && <PMCInfoModal isOpen={true} onClose={handlePMCClose} />}
    </header>
  );
});

Header.displayName = 'Header';
