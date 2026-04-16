'use client';

import React, { useState, useEffect } from 'react';

const COOKIE_CONSENT_KEY = 'pmi-cookie-consent';

export const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!consent) {
        setVisible(true);
      }
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ accepted: true, timestamp: new Date().toISOString() }));
    } catch {
      // 저장 실패 시 무시
    }
    setVisible(false);
  };

  const handleDecline = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ accepted: false, timestamp: new Date().toISOString() }));
    } catch {
      // 저장 실패 시 무시
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex-1">
          <p>
            본 웹사이트는 서비스 제공 및 사용자 경험 개선을 위해 쿠키를 사용합니다.
            필수 쿠키는 서비스 운영에 반드시 필요하며, 선택 쿠키는 사용 통계 분석에 활용됩니다.
            자세한 내용은{' '}
            <a href="/privacy" className="text-blue-600 hover:underline font-medium">개인정보처리방침</a>
            을 참고해 주세요.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            필수만 허용
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            모두 허용
          </button>
        </div>
      </div>
    </div>
  );
};
