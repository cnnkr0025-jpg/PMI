'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { toast } from 'sonner';
import { Palette, Paintbrush, Moon, MessageCircle, Trash2 } from 'lucide-react';
import type { ThemeColor } from '@/types';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/utils/translations';

// 동적 임포트
const DarkModeToggle = dynamic(() => import('@/components/DarkModeToggle').then(mod => ({ default: mod.DarkModeToggle })), { ssr: false });

export function SettingsForm() {
  const { themeSettings, setThemeSettings, settings, toggleSuccessNotifications, speechLevel, setSpeechLevel, autoDelete, setAutoDelete, performAutoDelete } = useStore();
  const router = useRouter();
  const { t } = useTranslation();
  
  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>('blue');
  
  // Color theme options - names will be translated dynamically
  const colorThemes = [
    { 
      nameKey: 'colorGray' as const, 
      value: 'gray' as ThemeColor,
      bg: 'bg-gray-500',
      hover: 'hover:bg-gray-600',
      focus: 'focus:ring-gray-400',
    },
    { 
      nameKey: 'colorRed' as const, 
      value: 'red' as ThemeColor,
      bg: 'bg-red-500',
      hover: 'hover:bg-red-600',
      focus: 'focus:ring-red-400',
    },
    { 
      nameKey: 'colorBlue' as const, 
      value: 'blue' as ThemeColor,
      bg: 'bg-blue-500',
      hover: 'hover:bg-blue-600',
      focus: 'focus:ring-blue-400',
    },
    { 
      nameKey: 'colorGreen' as const, 
      value: 'green' as ThemeColor,
      bg: 'bg-green-500',
      hover: 'hover:bg-green-600',
      focus: 'focus:ring-green-400',
    },
    { 
      nameKey: 'colorPurple' as const, 
      value: 'purple' as ThemeColor,
      bg: 'bg-purple-500',
      hover: 'hover:bg-purple-600',
      focus: 'focus:ring-purple-400',
    },
    { 
      nameKey: 'colorOrange' as const, 
      value: 'orange' as ThemeColor,
      bg: 'bg-orange-500',
      hover: 'hover:bg-orange-600',
      focus: 'focus:ring-orange-400',
    },
    { 
      nameKey: 'colorYellow' as const, 
      value: 'yellow' as ThemeColor,
      bg: 'bg-yellow-500',
      hover: 'hover:bg-yellow-600',
      focus: 'focus:ring-yellow-400',
    }
  ];

  // Update form fields when currentUser changes
  useEffect(() => {
    // Load saved theme from themeSettings
    if (themeSettings?.color) {
      setSelectedTheme(themeSettings.color);
      document.documentElement.setAttribute('data-theme', themeSettings.color);
    }
  }, [themeSettings]);
  
  const handleThemeChange = (theme: ThemeColor) => {
    setSelectedTheme(theme);
    
    // Update the theme in the root HTML element for global theming
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update the theme in the store
    setThemeSettings({ color: theme });
    
    // Show success message
    if (settings.showSuccessNotifications) {
      const themeObj = colorThemes.find(ct => ct.value === theme);
      const themeName = themeObj ? t.settings[themeObj.nameKey] : '';
      toast.success(`${t.settings.themeChanged}: ${themeName}`);
    }
  };

  const handleOpenDesignEditor = () => {
    router.push('/design-editor');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-6 py-8">
      {/* 디자인 에디터 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Paintbrush className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t.settings.designEditor}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.settings.designEditorDesc}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t.settings.designEditorDetail}
          </p>
          <button
            type="button"
            onClick={handleOpenDesignEditor}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground hover:opacity-90 rounded-lg font-medium text-sm transition-colors flex items-center justify-center"
          >
            <Paintbrush className="w-4 h-4 mr-2" />
            {t.settings.designButton}
          </button>
        </div>
      </div>

      {/* 반말/존댓말 설정 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI 말투 설정</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">AI가 존댓말 또는 반말로 답변하도록 설정합니다</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setSpeechLevel('formal'); toast.success('존댓말로 변경되었습니다.'); }}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                speechLevel === 'formal'
                  ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
              }`}
            >
              존댓말
              <p className="text-xs mt-1 font-normal">안녕하세요, 도와드릴게요!</p>
            </button>
            <button
              type="button"
              onClick={() => { setSpeechLevel('informal'); toast.success('반말로 변경되었습니다.'); }}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                speechLevel === 'informal'
                  ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
              }`}
            >
              반말
              <p className="text-xs mt-1 font-normal">안녕, 도와줄게!</p>
            </button>
          </div>
        </div>
      </div>

      {/* 다크모드 설정 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t.settings.darkMode}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">라이트, 다크, 시스템 모드 중 선택하세요</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <DarkModeToggle />
        </div>
      </div>

      {/* 테마 설정 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Palette className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t.settings.themeColor}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.settings.themeColorDesc}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-3">
            {colorThemes.map((theme) => (
              <button
                key={theme.value}
                type="button"
                onClick={() => handleThemeChange(theme.value)}
                className={`w-11 h-11 rounded-lg ${theme.bg} ${theme.hover} ${
                  selectedTheme === theme.value ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-900' : ''
                } transition-all`}
                title={t.settings[theme.nameKey]}
              >
                <span className="sr-only">{t.settings[theme.nameKey]}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            선택한 색상: <span className="font-medium text-gray-900 dark:text-gray-100">{colorThemes.find(ct => ct.value === selectedTheme) ? t.settings[colorThemes.find(ct => ct.value === selectedTheme)!.nameKey] : ''}</span>
          </p>
        </div>
      </div>

      {/* 자동 삭제 설정 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">대화 자동 삭제</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">일정 기간이 지난 대화를 자동으로 삭제합니다</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">자동 삭제 활성화</span>
            <button
              type="button"
              onClick={() => {
                setAutoDelete({ enabled: !autoDelete.enabled });
                toast.success(autoDelete.enabled ? '자동 삭제가 비활성화되었습니다.' : '자동 삭제가 활성화되었습니다.');
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                autoDelete.enabled ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoDelete.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {autoDelete.enabled && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">보존 기간</label>
                <div className="grid grid-cols-4 gap-2">
                  {[7, 14, 30, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setAutoDelete({ deleteAfterDays: days })}
                      className={`py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        autoDelete.deleteAfterDays === days
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {days}일
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">즐겨찾기 제외</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">별표 표시된 대화는 삭제하지 않습니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoDelete({ excludeStarred: !autoDelete.excludeStarred })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                    autoDelete.excludeStarred ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoDelete.excludeStarred ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  performAutoDelete();
                  toast.success(`${autoDelete.deleteAfterDays}일 이전 대화가 삭제되었습니다.`);
                }}
                className="w-full py-2.5 px-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-lg font-medium text-sm transition-colors"
              >
                지금 바로 삭제 실행
              </button>
            </>
          )}
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 settings-card">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path>
                  <path d="M12 17v-6"></path>
                  <path d="M12 9h.01"></path>
                </svg>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.settings.showSuccess}</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.settings.showSuccessDesc}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSuccessNotifications}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${settings.showSuccessNotifications ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.showSuccessNotifications ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
