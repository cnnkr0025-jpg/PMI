'use client';

import React, { memo } from 'react';
import { DesignElement, DesignTheme } from '@/types/design';
import { MessageSquare, Home, LayoutDashboard, Settings, Send, Plus } from 'lucide-react';
import { useStore } from '@/store';

interface LightweightPreviewProps {
  currentPage: 'chat' | 'dashboard' | 'settings';
  theme: DesignTheme;
  elementColors: Record<string, string>;
  onElementClick: (element: DesignElement) => void;
  onSendButtonCustomize?: () => void;
}

const PreviewHeader = memo(({ 
  theme, 
  elementColors, 
  onElementClick 
}: { 
  theme: DesignTheme; 
  elementColors: Record<string, string>; 
  onElementClick: (element: DesignElement) => void;
}) => {
  const headerBg = elementColors['header'] || theme.headerColor || '#ffffff';
  
  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementClick({
      id: 'header',
      type: 'header',
      label: '헤더 배경',
      selector: 'header',
      currentColor: headerBg,
      scope: 'global',
    });
  };

  return (
    <header 
      className="border-b px-4 py-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ backgroundColor: headerBg }}
      onClick={handleHeaderClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg"></div>
            <span className="font-bold text-gray-900">Pick-My-AI</span>
          </div>
          <nav className="flex items-center space-x-1">
            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1.5">
              <Home className="w-4 h-4" /> 홈
            </button>
            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4" /> 채팅
            </button>
            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1.5">
              <LayoutDashboard className="w-4 h-4" /> 대시보드
            </button>
            <button className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1.5">
              <Settings className="w-4 h-4" /> 설정
            </button>
          </nav>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">사용자</span>
        </div>
      </div>
    </header>
  );
});
PreviewHeader.displayName = 'PreviewHeader';

const ChatPreview = memo(({ 
  theme, 
  elementColors, 
  onElementClick,
  onSendButtonCustomize,
}: { 
  theme: DesignTheme; 
  elementColors: Record<string, string>; 
  onElementClick: (element: DesignElement) => void;
  onSendButtonCustomize?: () => void;
}) => {
  const { sendButtonSymbol } = useStore();
  const sidebarBg = elementColors['chat-list-card'] || theme.cardColor || '#f9fafb';
  const messageBg = elementColors['chat-message-card'] || theme.cardColor || '#ffffff';
  const inputCardBg = elementColors['chat-input-card'] || theme.cardColor || '#ffffff';
  const newChatButtonBg = elementColors['chat-new-button'] || theme.buttonColor || '#3b82f6';
  const sendButtonBg = elementColors['chat-send-button'] || theme.buttonColor || '#3b82f6';

  return (
    <div className="flex h-[500px]">
      {/* 사이드바 */}
      <div 
        className="w-64 border-r p-4 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ backgroundColor: sidebarBg }}
        onClick={(e) => {
          e.stopPropagation();
          onElementClick({
            id: 'chat-list-card',
            type: 'card',
            label: '채팅 사이드바',
            selector: '.chat-list-card',
            currentColor: sidebarBg,
            scope: 'element',
          });
        }}
      >
        <button 
          className="w-full py-2 px-4 rounded-lg text-white text-sm font-medium mb-4 cursor-pointer"
          style={{ backgroundColor: newChatButtonBg }}
          onClick={(e) => {
            e.stopPropagation();
            onElementClick({
              id: 'chat-new-button',
              type: 'button',
              label: '새 채팅 버튼',
              selector: '.chat-new-button',
              currentColor: newChatButtonBg,
              scope: 'element',
            });
          }}
        >
          <Plus className="w-4 h-4 inline mr-2" /> 새 채팅
        </button>
        <div className="space-y-2">
          {['오늘의 대화', '어제의 대화', '지난 주 대화'].map((title, i) => (
            <div key={i} className="p-3 rounded-lg bg-white/50 hover:bg-white/80 cursor-pointer">
              <div className="text-sm font-medium text-gray-700">{title}</div>
              <div className="text-xs text-gray-500 mt-1">GPT-5.1 · 3개 메시지</div>
            </div>
          ))}
        </div>
      </div>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col">
        <div
          className="flex-1 p-4 space-y-4 overflow-auto cursor-pointer hover:opacity-90"
          style={{ backgroundColor: messageBg }}
          onClick={(e) => {
            e.stopPropagation();
            onElementClick({
              id: 'chat-message-card',
              type: 'card',
              label: '채팅 메시지 카드',
              selector: '.chat-message-card',
              currentColor: messageBg,
              scope: 'element',
            });
          }}
        >
          <div className="flex justify-end">
            <div
              className="max-w-[70%] p-3 rounded-2xl bg-blue-100 text-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              안녕하세요! 오늘 날씨가 어때요?
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs">AI</div>
            <div
              className="max-w-[70%] p-3 rounded-2xl bg-gray-100 text-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              안녕하세요! 오늘 서울 날씨는 맑고 기온은 15°C입니다.
            </div>
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="border-t p-4">
          <div 
            className="flex items-center space-x-2 p-3 rounded-xl border cursor-pointer hover:opacity-90"
            style={{ backgroundColor: inputCardBg }}
            onClick={(e) => {
              e.stopPropagation();
              onElementClick({
                id: 'chat-input-card',
                type: 'card',
                label: '채팅 입력창',
                selector: '.chat-input-card',
                currentColor: inputCardBg,
                scope: 'element',
              });
            }}
          >
            <input 
              type="text" 
              placeholder="메시지를 입력하세요..." 
              className="flex-1 bg-transparent outline-none text-sm"
              readOnly
            />
            <button 
              className="p-2 rounded-full text-white cursor-pointer relative group"
              style={{ backgroundColor: sendButtonBg }}
              onClick={(e) => {
                e.stopPropagation();
                if (onSendButtonCustomize) {
                  onSendButtonCustomize();
                } else {
                  onElementClick({
                    id: 'chat-send-button',
                    type: 'button',
                    label: '전송 버튼',
                    selector: '.chat-send-button',
                    currentColor: sendButtonBg,
                    scope: 'element',
                  });
                }
              }}
              title="클릭: 색상 변경 | 우클릭: 기호·소리 설정"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onSendButtonCustomize) onSendButtonCustomize();
              }}
            >
              {sendButtonSymbol ? (
                <span className="text-sm leading-none">{sendButtonSymbol}</span>
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                기호·소리 설정
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
ChatPreview.displayName = 'ChatPreview';

const DashboardPreview = memo(({ 
  theme, 
  elementColors, 
  onElementClick 
}: { 
  theme: DesignTheme; 
  elementColors: Record<string, string>; 
  onElementClick: (element: DesignElement) => void;
}) => {
  const getContrastHex = (hexColor: string): string => {
    const hex = hexColor?.replace('#', '');
    if (!hex || hex.length !== 6) return '#ffffff';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111827' : '#ffffff';
  };

  const startChatBg = elementColors['dashboard-start-chat-button'] || '#f3f4f6';
  const buyCreditBg = elementColors['dashboard-buy-credit-button'] || '#111827';
  const creditCardBg = elementColors['dashboard-credit-card'] || theme.cardColor || '#ffffff';
  const chatCardBg = elementColors['dashboard-chat-card'] || theme.cardColor || '#ffffff';
  const usageCardBg = elementColors['dashboard-usage-card'] || theme.cardColor || '#ffffff';
  const activityCardBg = elementColors['dashboard-activity-card'] || theme.cardColor || '#ffffff';

  const makeClickHandler = (id: string, label: string, color: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementClick({ id, type: 'button', label, selector: `.${id}`, currentColor: color, scope: 'element' });
  };
  const makeCardClickHandler = (id: string, label: string, color: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementClick({ id, type: 'card', label, selector: `.${id}`, currentColor: color, scope: 'element' });
  };

  const models = [
    { name: 'GPT-5.1', remaining: 8, total: 10 },
    { name: 'Claude Sonnet 4.6', remaining: 5, total: 10 },
    { name: 'Gemini 2.5 Pro', remaining: 3, total: 5 },
  ];

  return (
    <div className="px-6 py-8 bg-white min-h-[500px] space-y-8">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mb-1">대시보드</h1>
          <p className="text-sm text-gray-500">크레딧 현황과 사용 내역을 확인하세요</p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: startChatBg, color: getContrastHex(startChatBg) === '#ffffff' ? '#111827' : getContrastHex(startChatBg), borderColor: '#d1d5db' }}
            onClick={makeClickHandler('dashboard-start-chat-button', '채팅 시작 버튼', startChatBg)}
            title="클릭하여 색상 변경"
          >
            <MessageSquare className="w-3.5 h-3.5" /> 채팅 시작
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: buyCreditBg, color: getContrastHex(buyCreditBg) }}
            onClick={makeClickHandler('dashboard-buy-credit-button', '크레딧 구매 버튼', buyCreditBg)}
            title="클릭하여 색상 변경"
          >
            <Plus className="w-3.5 h-3.5" /> 크레딧 구매
          </button>
        </div>
      </div>

      {/* 통계 그리드 */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">크레딧 현황</p>
        <div className="grid grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
          {[
            { id: 'dashboard-credit-card', bg: creditCardBg, label: '크레딧 카드', title: 'PMC 잔액', value: '1,200', sub: '1 PMC = 1원' },
            { id: null, bg: '#ffffff', label: '', title: 'PMC 절약', value: '₩3,400', sub: '누적 절약' },
            { id: null, bg: '#ffffff', label: '', title: '잔여 크레딧', value: '16', sub: '잔여 / 전체 25' },
            { id: 'dashboard-chat-card', bg: chatCardBg, label: '대화 카드', title: '총 대화', value: '48', sub: '총 대화 수' },
          ].map((item, i) => (
            <div
              key={i}
              className={`px-5 py-4 ${item.id ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
              style={{ backgroundColor: item.id ? item.bg : '#ffffff' }}
              onClick={item.id ? makeCardClickHandler(item.id, item.label, item.bg) : undefined}
              title={item.id ? '클릭하여 색상 변경' : undefined}
            >
              <p className="text-xs text-gray-500 mb-1">{item.title}</p>
              <p className="text-xl font-semibold text-gray-900">{item.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 2열 */}
      <div className="grid grid-cols-5 gap-8">
        {/* 모델별 크레딧 */}
        <div
          className="col-span-3 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: usageCardBg }}
          onClick={makeCardClickHandler('dashboard-usage-card', '모델 사용량 카드', usageCardBg)}
          title="클릭하여 색상 변경"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">모델별 크레딧</p>
          <div className="space-y-4">
            {models.map((m, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700">{m.name}</span>
                  <span className="text-sm tabular-nums text-gray-500">{m.remaining} / {m.total}</span>
                </div>
                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gray-900 rounded-full" style={{ width: `${(m.remaining / m.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 활동 */}
        <div
          className="col-span-2 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: activityCardBg }}
          onClick={makeCardClickHandler('dashboard-activity-card', '최근 활동 카드', activityCardBg)}
          title="클릭하여 색상 변경"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-4">최근 활동</p>
          <div className="space-y-4">
            {[
              { action: '크레딧 사용', model: 'GPT-5.1', time: '10분 전' },
              { action: '크레딧 사용', model: 'Claude Sonnet', time: '1시간 전' },
              { action: '크레딧 구매', model: '', time: '2일 전' },
            ].map((tx, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {tx.action === '크레딧 구매'
                    ? <Plus className="w-2.5 h-2.5 text-gray-500" />
                    : <MessageSquare className="w-2.5 h-2.5 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 leading-tight">{tx.action}</p>
                  {tx.model && <p className="text-[10px] text-gray-500 mt-0.5">{tx.model}</p>}
                  <p className="text-[10px] text-gray-400 mt-0.5">{tx.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
DashboardPreview.displayName = 'DashboardPreview';

const SettingsPreview = memo(({ 
  theme, 
  elementColors, 
  onElementClick 
}: { 
  theme: DesignTheme; 
  elementColors: Record<string, string>; 
  onElementClick: (element: DesignElement) => void;
}) => {
  const cardBg = elementColors['settings-card'] || theme.cardColor || '#ffffff';

  const SettingCard = ({ id, label, title, description }: { id: string; label: string; title: string; description: string }) => (
    <div 
      className="p-6 rounded-xl border cursor-pointer hover:opacity-90 transition-opacity"
      style={{ backgroundColor: cardBg }}
      onClick={(e) => {
        e.stopPropagation();
        onElementClick({
          id,
          type: 'card',
          label,
          selector: `.${id}`,
          currentColor: cardBg,
          scope: 'element',
        });
      }}
    >
      <h3 className="font-medium text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-[500px] max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      
      <div className="space-y-4">
        <SettingCard 
          id="settings-theme-card" 
          label="테마 설정 카드" 
          title="테마 색상" 
          description="앱 전체 테마 색상을 선택하세요" 
        />
        <SettingCard 
          id="settings-dark-card" 
          label="다크모드 카드" 
          title="다크 모드" 
          description="라이트, 다크, 시스템 모드 선택" 
        />
        <SettingCard 
          id="settings-notify-card" 
          label="알림 설정 카드" 
          title="알림 설정" 
          description="성공 알림 표시 여부를 설정합니다" 
        />
      </div>
    </div>
  );
});
SettingsPreview.displayName = 'SettingsPreview';

export const LightweightPreview: React.FC<LightweightPreviewProps> = memo(({
  currentPage,
  theme,
  elementColors,
  onElementClick,
  onSendButtonCustomize,
}) => {
  const bgColor = elementColors['background'] || theme.backgroundColor || '#ffffff';

  return (
    <div 
      className="w-full overflow-hidden rounded-lg"
      style={{ backgroundColor: bgColor }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onElementClick({
            id: 'background',
            type: 'background',
            label: '배경색',
            selector: 'body',
            currentColor: bgColor,
            scope: 'global',
          });
        }
      }}
    >
      <PreviewHeader theme={theme} elementColors={elementColors} onElementClick={onElementClick} />
      
      
      {currentPage === 'chat' && (
        <ChatPreview theme={theme} elementColors={elementColors} onElementClick={onElementClick} onSendButtonCustomize={onSendButtonCustomize} />
      )}
      {currentPage === 'dashboard' && (
        <DashboardPreview theme={theme} elementColors={elementColors} onElementClick={onElementClick} />
      )}
      {currentPage === 'settings' && (
        <SettingsPreview theme={theme} elementColors={elementColors} onElementClick={onElementClick} />
      )}
    </div>
  );
});

LightweightPreview.displayName = 'LightweightPreview';
