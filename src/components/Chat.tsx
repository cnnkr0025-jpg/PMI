'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/store';
import { shallow } from 'zustand/shallow';
import { Button } from '@/components/ui/Button';
import { Plus, Settings, LayoutDashboard, Trash2, X, Download, Pencil, Check, Bot, Paperclip, ChevronRight, AlertCircle, MessageSquare, GitCompare, UserCircle, Copy, Square, Star, Volume2, RefreshCw, Search, FileText, Link2, Swords, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils/cn';
import { useRouter } from 'next/navigation';
import type { ChatMessage } from '@/types';
import { useTranslation } from '@/utils/translations';
import { endChatPerfRun, initChatPerfOnce, isChatPerfEnabled, recordChatPerfReactCommit, startChatPerfRun } from '@/utils/chatPerf';
import { extractSummary, buildConversationContext, ConversationSummary } from '@/utils/summaryExtractor';
import { renderLatex } from '@/utils/renderLatex';
const GraphRenderer = dynamic(() => import('@/components/GraphRenderer').then(m => m.GraphRenderer), { ssr: false });

// Constants
const MAX_ATTACHMENTS = 5;
const STREAMING_DRAFT_V2 = process.env.NEXT_PUBLIC_STREAMING_DRAFT_V2 === 'true';
const STREAMING_DRAFT_UI_THROTTLE_MS = 0;
const REQUEST_BODY_SIZE_LIMIT_BYTES = 4 * 1024 * 1024;
const TEXT_SIZE_ENCODER = new TextEncoder();
const COMPOSER_DRAFT_STORAGE_PREFIX = 'pickmyai:chat-draft';
const COMPOSER_DRAFT_TTL_MS = 10 * 60 * 1000;

type PersistedComposerDraft = {
  message: string;
  updatedAt: number;
};

// 메모이제이션된 서브 컴포넌트들
const MessageItem = React.memo(({ message, formatMessage }: any) => (
  <div className="whitespace-pre-wrap break-words">
    {formatMessage(message.content)}
  </div>
));
MessageItem.displayName = 'MessageItem';

const MEM_BLOCK_START = '@@MEM@@';
const MEM_BLOCK_END = '@@END@@';

const removeAllOccurrences = (text: string, needle: string) => {
  if (!text || !needle) return text;
  return text.split(needle).join('');
};

const stripTrailingPartialMarkers = (text: string) => {
  const markers = [MEM_BLOCK_START, MEM_BLOCK_END];
  const maxHold = Math.max(...markers.map((m) => m.length - 1));
  const maxCheck = Math.min(maxHold, text.length);

  let cut = 0;
  for (let i = 1; i <= maxCheck; i++) {
    const suffix = text.slice(-i);
    if (markers.some((m) => m.startsWith(suffix))) {
      cut = i;
    }
  }

  return cut ? text.slice(0, -cut) : text;
};

const extractMemoryForDisplay = (text: string) => {
  let facts: string[] = [];
  const cleanedParts: string[] = [];
  let cursor = 0;

  while (true) {
    const start = text.indexOf(MEM_BLOCK_START, cursor);
    if (start === -1) {
      cleanedParts.push(text.slice(cursor));
      break;
    }

    cleanedParts.push(text.slice(cursor, start));
    const afterStart = start + MEM_BLOCK_START.length;
    const end = text.indexOf(MEM_BLOCK_END, afterStart);
    if (end === -1) {
      cursor = text.length;
      break;
    }

    const block = text.slice(afterStart, end);
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    facts = facts.concat(lines);
    cursor = end + MEM_BLOCK_END.length;
  }

  let displayText = cleanedParts.join('');
  displayText = stripTrailingPartialMarkers(displayText);
  displayText = removeAllOccurrences(displayText, MEM_BLOCK_START);
  displayText = removeAllOccurrences(displayText, MEM_BLOCK_END);

  return { displayText, facts };
};

const extractErrorCodeToken = (value: string) => value.match(/\b(ERR_[A-Z0-9_]+)\b/)?.[1];

const getStatusFallbackErrorCode = (status: number) => {
  if (status === 401 || status === 403) return 'ERR_AUTH';
  if (status === 429) return 'ERR_RATE';
  if (status === 408 || status === 504) return 'ERR_TIMEOUT';
  if (status >= 500) return 'ERR_NET_00';
  if (status >= 400) return 'ERR_RESP_00';
  return 'ERR_UNKNOWN';
};

const readApiErrorResponse = async (response: Response): Promise<{ errorCode: string; errorReason?: string }> => {
  let errorData: any = null;
  let rawText = '';
  const contentType = response.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      errorData = await response.json();
    } else {
      rawText = await response.text();
      if (rawText.trim().startsWith('{')) {
        errorData = JSON.parse(rawText);
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to parse error response:', e);
    }
  }

  const rawReason = typeof errorData?.reason === 'string'
    ? errorData.reason
    : typeof errorData?.message === 'string'
      ? errorData.message
      : rawText;
  const errorReason = rawReason?.trim() ? rawReason.trim().slice(0, 280) : undefined;
  const errorCode =
    (typeof errorData?.error === 'string' && errorData.error) ||
    (errorReason ? extractErrorCodeToken(errorReason) : undefined) ||
    getStatusFallbackErrorCode(response.status);
  const normalizedReason = (errorReason || '').toLowerCase();
  const normalizedErrorCode = normalizedReason.includes('body stream buffer was aborted') || normalizedReason.includes('bodystreambuffer was aborted')
    ? 'ERR_CANCELLED'
    : errorCode;

  return {
    errorCode: normalizedErrorCode,
    errorReason: errorReason && errorReason !== normalizedErrorCode ? errorReason : undefined,
  };
};

const readChatSuccessResponse = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    const rawStream = await response.text();
    let accumulated = '';

    for (const rawLine of rawStream.split('\n')) {
      const trimmed = rawLine.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) {
          throw new Error(typeof parsed.error === 'string' ? parsed.error : 'ERR_RESP_00');
        }
        const delta = typeof parsed.choices?.[0]?.delta?.content === 'string'
          ? parsed.choices[0].delta.content
          : '';
        if (delta) accumulated += delta;
      } catch (error: any) {
        if (typeof error?.message === 'string' && error.message.startsWith('ERR_')) {
          throw error;
        }
        throw new Error('ERR_RESP_00');
      }
    }

    if (!accumulated.trim()) {
      throw new Error('ERR_EMPTY_01');
    }

    return accumulated;
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('ERR_RESP_00');
  }

  if (typeof data?.content !== 'string' || !data.content.trim()) {
    throw new Error('ERR_EMPTY_00');
  }

  return data.content;
};

const getTextByteSize = (value: string) => TEXT_SIZE_ENCODER.encode(value).length;

// Types
type Attachment = {
  id: string;
  name: string;
  type: 'image' | 'text';
  dataUrl?: string;
  content?: string;
};

// ~요약~ 숨기기: ~~로 감싼 요약 부분을 제거
const stripSummaryBlock = (text: string): string => {
  if (!text) return text;
  // ~~...~~ 블록 제거 (여러 줄 가능)
  return text.replace(/~~[\s\S]*?~~/g, '').trim();
};

// 복사 함수
const handleCopyText = (text: string) => {
  const cleaned = stripSummaryBlock(text);
  navigator.clipboard.writeText(cleaned).then(() => {
    toast.success('복사되었습니다!');
  }).catch(() => {
    toast.error('복사에 실패했습니다.');
  });
}

const _chatMsgAreEqual = (prev: any, next: any) =>
  prev.overrideContent === next.overrideContent &&
  prev.isStreaming === next.isStreaming &&
  prev.isLastAssistant === next.isLastAssistant &&
  prev.isBookmarked === next.isBookmarked &&
  prev.msg.content === next.msg.content &&
  prev.msg.id === next.msg.id;

 type ChatMessageRowProps = {
   msg: ChatMessage;
   msgIndex: number;
   overrideContent?: string;
   modelById: Map<string, any>;
   formatMessage: (text: string) => React.ReactNode;
   onDownloadImage: (imageUrl: string, filename?: string) => void;
   isStreaming?: boolean;
   isLastAssistant?: boolean;
   isBookmarked?: boolean;
   onBookmark?: (msgId: string) => void;
   onTTS?: (content: string) => void;
   onRegenerate?: () => void;
   availableModels?: any[];
   onRegenerateWithModel?: (modelId: string) => void;
 };

 const ChatMessageRow = React.memo(function ChatMessageRowInner(props: ChatMessageRowProps) {
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   const { msg, msgIndex, overrideContent, modelById, formatMessage, onDownloadImage, isStreaming, isLastAssistant, isBookmarked, onBookmark, onTTS, onRegenerate, availableModels, onRegenerateWithModel } = props;
   const model = msg.modelId ? (modelById.get(msg.modelId) ?? null) : null;
   const [showRegenMenu, setShowRegenMenu] = React.useState(false);

   const rawContent = (overrideContent ?? (msg.content as unknown as string)) as unknown as string;
  // ~요약~ 숨기기 적용
  const content = rawContent ? stripSummaryBlock(rawContent) : rawContent;
  const isVideo = typeof content === 'string' && content.startsWith('__VIDEO__:');
  const videoUrl = isVideo ? content.slice('__VIDEO__:'.length) : null;
  const isImage = !isVideo && typeof content === 'string' && (
    content.startsWith('http://') ||
    content.startsWith('https://') ||
    content.startsWith('data:image')
  );

   return (
     <div className={cn('group mb-4', msgIndex === 0 ? 'mt-2' : '')}>
       {msg.role === 'user' ? (
         <div className="flex justify-end">
           <div className="relative inline-block bg-blue-100 text-gray-900 rounded-2xl px-4 py-3 max-w-[80%]">
             <div className="text-[15px] leading-6">
               {isImage ? (
                 <div className="relative group">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={content}
                     alt="AI 생성 이미지"
                     className="max-w-full rounded border"
                   />
                   <button
                     onClick={() => onDownloadImage(content, `ai-image-${Date.now()}.png`)}
                     className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                     title="이미지 다운로드"
                   >
                     <Download className="w-4 h-4 text-gray-700" />
                   </button>
                 </div>
               ) : (
                 <div className="whitespace-pre-wrap">{formatMessage(content)}</div>
               )}
             </div>
             {/* 사용자 메시지 복사 버튼 */}
             {content && !isImage && (
               <button
                 onClick={() => handleCopyText(rawContent)}
                 className="absolute -bottom-6 right-0 p-1 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                 title="복사"
               >
                 <Copy className="w-3.5 h-3.5 text-gray-400" />
               </button>
             )}
           </div>
         </div>
       ) : (
         <div className="flex items-start space-x-3">
           <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white">
             <Bot className="w-5 h-5" />
           </div>
           <div className="flex-1 pt-1">
             <div className="font-semibold text-gray-900 text-sm mb-1">
               {model?.displayName || 'ChatGPT'}
             </div>
             <div className="text-gray-800 text-[15px] leading-7">
               {(!content && isStreaming) ? (
                 <div className="flex space-x-1 py-2">
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}} />
                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
                 </div>
               ) : !content ? (
                 <div className="text-gray-400 italic text-sm">응답이 중단되었어요. 다시 시도해 주세요.</div>
               ) : isVideo && videoUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-black max-w-xl">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay={false}
                    className="w-full max-h-[480px] object-contain"
                    playsInline
                  />
                  <a
                    href={videoUrl}
                    download={`ai-video-${Date.now()}.mp4`}
                    className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                    title="영상 다운로드"
                  >
                    <Download className="w-4 h-4 text-gray-700" />
                  </a>
                </div>
              ) : isImage ? (
                 <div className="relative group">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={content}
                     alt="AI 생성 이미지"
                     className="max-w-full rounded border"
                   />
                   <button
                     onClick={() => onDownloadImage(content, `ai-image-${Date.now()}.png`)}
                     className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                     title="이미지 다운로드"
                   >
                     <Download className="w-4 h-4 text-gray-700" />
                   </button>
                 </div>
               ) : (
                 <div className="whitespace-pre-wrap">{formatMessage(content)}</div>
               )}
             </div>
             {/* AI 메시지 액션 버튼들 */}
             {content && !isImage && !isVideo && !isStreaming && (
               <div className="mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={() => handleCopyText(rawContent)} className="p-1 rounded hover:bg-gray-100" title="복사">
                   <Copy className="w-3.5 h-3.5 text-gray-400" />
                 </button>
                 {onBookmark && (
                   <button onClick={() => onBookmark(msg.id)} className="p-1 rounded hover:bg-gray-100" title={isBookmarked ? '북마크 해제' : '북마크'}>
                     <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
                   </button>
                 )}
                 {onTTS && content && (
                   <button onClick={() => onTTS(content)} className="p-1 rounded hover:bg-gray-100" title="소리로 읽기">
                     <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                   </button>
                 )}
                 {isLastAssistant && onRegenerate && (
                   <div className="relative">
                     <button
                       onClick={() => setShowRegenMenu(v => !v)}
                       className="p-1 rounded hover:bg-gray-100 flex items-center gap-0.5"
                       title="다시 생성"
                     >
                       <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                     </button>
                     {showRegenMenu && (
                       <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden">
                         <button
                           onClick={() => { onRegenerate(); setShowRegenMenu(false); }}
                           className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                         >
                           <RefreshCw className="w-3.5 h-3.5" />
                           같은 모델로 재생성
                         </button>
                         {availableModels && availableModels.filter(m => m.id !== msg.modelId).map((m: any) => (
                           <button
                             key={m.id}
                             onClick={() => { onRegenerateWithModel?.(m.id); setShowRegenMenu(false); }}
                             className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                           >
                             <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                             {m.displayName}으로 재생성
                           </button>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
               </div>
             )}
           </div>
         </div>
       )}
     </div>
   );
 }, _chatMsgAreEqual);

 ChatMessageRow.displayName = 'ChatMessageRow';

export const Chat: React.FC = () => {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [videoSeconds, setVideoSeconds] = useState<number>(5);
  const [batchPendingMessageId, setBatchPendingMessageId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPersona, setShowPersona] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showChainMode, setShowChainMode] = useState(false);
  const [showDebateMode, setShowDebateMode] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showSmartRouterPanel, setShowSmartRouterPanel] = useState(false);
  const [smartRouterAutoAnalyzeToken, setSmartRouterAutoAnalyzeToken] = useState(0);
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const [draftMessageId, setDraftMessageId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const draftContentRef = useRef('');
  const cancelRequestedRef = useRef(false);
  const lastDraftFlushRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const userScrolledUpRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollToastIdRef = useRef<string | number | null>(null);
  const isMountedRef = useRef(true);
  const batchPendingRefundRef = useRef<{ messageId: string; modelId: string; piWon: number; refundToken: string } | null>(null);
  const composerDraftHydratedKeyRef = useRef<string | null>(null);
  
  const {
    chatSessions,
    currentSessionId,
    createChatSession,
    updateChatSessionTitle,
    deleteChatSession,
    addMessage,
    updateMessageContent,
    finalizeMessageContent,
    storedFacts,
    addStoredFacts,
    deductCredit,
    refundCredit,
    releasePendingRefundToken,
    addCredits,
    setCurrentSession,
    models,
    walletCredits,
    activeTemplate,
    clearActiveTemplate,
    activePersona,
    language,
    streaming,
    showDeleteConfirmation,
    currentUser,
    bookmarkedMessages,
    addBookmark,
    removeBookmark,
    speechLevel,
    sendButtonSymbol,
    sendButtonSound,
  } = useStore(
    (state) => ({
      chatSessions: state.chatSessions,
      currentSessionId: state.currentSessionId,
      createChatSession: state.createChatSession,
      updateChatSessionTitle: state.updateChatSessionTitle,
      deleteChatSession: state.deleteChatSession,
      addMessage: state.addMessage,
      updateMessageContent: state.updateMessageContent,
      finalizeMessageContent: state.finalizeMessageContent,
      storedFacts: state.storedFacts,
      addStoredFacts: state.addStoredFacts,
      deductCredit: state.deductCredit,
      refundCredit: state.refundCredit,
      releasePendingRefundToken: state.releasePendingRefundToken,
      addCredits: state.addCredits,
      setCurrentSession: state.setCurrentSession,
      models: state.models,
      walletCredits: state.wallet?.credits ?? null,
      activeTemplate: state.activeTemplate,
      clearActiveTemplate: state.clearActiveTemplate,
      activePersona: state.activePersona,
      language: state.language,
      streaming: state.streaming,
      showDeleteConfirmation: state.settings.showDeleteConfirmation,
      currentUser: state.currentUser,
      bookmarkedMessages: state.bookmarkedMessages,
      addBookmark: state.addBookmark,
      removeBookmark: state.removeBookmark,
      speechLevel: state.speechLevel,
      sendButtonSymbol: state.sendButtonSymbol,
      sendButtonSound: state.sendButtonSound,
    }),
    shallow
  );

  // 스트리밍 content Map: 버전 카운터만 구독 (Map 복사 없이 O(1) 리렌더 트리거)
  const streamingState = useStore(
    (state) =>
      draftMessageId
        ? null
        : {
            version: state._streamingVersion,
            content: state._streamingContent,
          },
    shallow
  );
  const streamingContent = streamingState?.content;

  const selectedModelPiWon = useMemo(() => {
    const m = models.find(m => m.id === selectedModelId);
    return m?.piWon ?? 1;
  }, [models, selectedModelId]);

  const getComposerDraftStorageKey = useCallback((sessionId: string | null | undefined) => {
    const userKey = currentUser?.id ?? 'guest';
    const sessionKey = sessionId ?? 'new';
    return `${COMPOSER_DRAFT_STORAGE_PREFIX}:${userKey}:${sessionKey}`;
  }, [currentUser?.id]);

  const composerDraftStorageKey = useMemo(
    () => getComposerDraftStorageKey(currentSessionId),
    [currentSessionId, getComposerDraftStorageKey]
  );

  const removeComposerDraft = useCallback((storageKey: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKey);
  }, []);

  const persistComposerDraft = useCallback((storageKey: string, value: string) => {
    if (typeof window === 'undefined') return;

    if (!value.trim()) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const payload: PersistedComposerDraft = {
      message: value,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, []);

  const readComposerDraft = useCallback((storageKey: string) => {
    if (typeof window === 'undefined') return '';

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return '';

    try {
      const parsed = JSON.parse(raw) as PersistedComposerDraft;
      if (typeof parsed?.message !== 'string' || typeof parsed?.updatedAt !== 'number') {
        window.localStorage.removeItem(storageKey);
        return '';
      }

      if (Date.now() - parsed.updatedAt > COMPOSER_DRAFT_TTL_MS) {
        window.localStorage.removeItem(storageKey);
        return '';
      }

      return parsed.message;
    } catch {
      window.localStorage.removeItem(storageKey);
      return '';
    }
  }, []);

  const { t } = useTranslation();

  const chatPerfEnabled = useMemo(() => isChatPerfEnabled(), []);

  useEffect(() => {
    initChatPerfOnce();
  }, []);

  useEffect(() => {
    const restoredDraft = readComposerDraft(composerDraftStorageKey);
    composerDraftHydratedKeyRef.current = composerDraftStorageKey;
    setMessage(restoredDraft);
  }, [composerDraftStorageKey, readComposerDraft]);

  useEffect(() => {
    if (composerDraftHydratedKeyRef.current !== composerDraftStorageKey) return;
    persistComposerDraft(composerDraftStorageKey, message);
  }, [composerDraftStorageKey, message, persistComposerDraft]);

  // 컴포넌트 마운트 시 상태 초기화
  useEffect(() => {
    isMountedRef.current = true;
    draftContentRef.current = '';
    lastDraftFlushRef.current = 0;
    setDraftMessageId(null);
    setDraftContent('');
    // 페이지가 다시 로드될 때 이전 상태 정리
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    streamingRef.current = false;
    sendInFlightRef.current = false;
    setIsLoading(false);
    cancelRequestedRef.current = false;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      streamingRef.current = false;
      sendInFlightRef.current = false;
      draftContentRef.current = '';
      lastDraftFlushRef.current = 0;
      setDraftMessageId(null);
      setDraftContent('');
    };
  }, []);
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (streamingRef.current || !!abortControllerRef.current || sendInFlightRef.current) {
        e.preventDefault();
        e.returnValue = 'AI가 답변을 생성하고 있습니다. 페이지를 떠나면 답변이 중단됩니다.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 링크 클릭 / 뒤로가기 시 스트리밍 중 경고
  useEffect(() => {
    // Next.js 라우터 이벤트는 직접 감지할 수 없으므로 링크 클릭 감지
    const handleLinkClick = (e: MouseEvent) => {
      if (streamingRef.current || isLoading) {
        const target = e.target as HTMLElement;
        const link = target.closest('a');
        if (link && link.href && !link.href.startsWith('javascript:')) {
          const confirmLeave = window.confirm('AI가 답변을 생성하고 있습니다. 페이지를 떠나면 답변이 중단됩니다. 계속하시겠습니까?');
          if (!confirmLeave) {
            e.preventDefault();
            e.stopPropagation();
          } else {
            // 이동을 확인한 경우 상태 정리
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            streamingRef.current = false;
            setIsLoading(false);
            cancelRequestedRef.current = false;
          }
        }
      }
    };

    // 브라우저 뒤로가기/앞으로가기 감지
    const handlePopState = (e: PopStateEvent) => {
      if (streamingRef.current || isLoading) {
        const confirmLeave = window.confirm('AI가 답변을 생성하고 있습니다. 페이지를 떠나면 답변이 중단됩니다. 계속하시겠습니까?');
        if (!confirmLeave) {
          e.preventDefault();
          window.history.pushState(null, '', window.location.pathname);
        } else {
          // 이동을 확인한 경우 상태 정리
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
          streamingRef.current = false;
          setIsLoading(false);
          cancelRequestedRef.current = false;
        }
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      document.removeEventListener('click', handleLinkClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isLoading, router]);

  const handleReactProfilerRender = useCallback<React.ProfilerOnRenderCallback>(
    (id, _phase, actualDuration) => {
      recordChatPerfReactCommit(id, actualDuration);
    },
    []
  );

  const wrapWithProfiler = useCallback(
    (id: string, node: React.ReactNode) => {
      if (!chatPerfEnabled) return node;
      return (
        <React.Profiler id={id} onRender={handleReactProfilerRender}>
          {node}
        </React.Profiler>
      );
    },
    [chatPerfEnabled, handleReactProfilerRender]
  );

  // 메모이제이션으로 불필요한 재계산 방지
  const sortedSessions = useMemo(
    () =>
      [...chatSessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [chatSessions]
  );

  const currentSession = useMemo(() => 
    chatSessions.find(s => s.id === currentSessionId), 
    [chatSessions, currentSessionId]
  );

  const currentMessages = useMemo<ChatMessage[]>(() => currentSession?.messages || [], [currentSession]);

  // Clear per-session summaries when switching sessions to free memory
  useEffect(() => {
    setConversationSummaries([]);
  }, [currentSessionId]);

  const modelById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of models) {
      map.set(m.id, m);
    }
    return map;
  }, [models]);

  const selectedModel = useMemo(() => {
    if (!selectedModelId) return null;
    return modelById.get(selectedModelId) ?? null;
  }, [modelById, selectedModelId]);

  const selectedModelMaxCharacters = useMemo(() => {
    return selectedModel?.maxCharacters || 2500;
  }, [selectedModel]);

  const isVideoModel = useMemo(() => selectedModel?.series === 'video', [selectedModel]);
  const isBatchModel = useMemo(() => !!selectedModel?.isBatch, [selectedModel]);
  // 이미지 첨부 불가 모델 (dalle3, o3mini)
  const isImageAttachDisabled = useMemo(() => {
    return selectedModelId === 'dalle3' || selectedModelId === 'o3mini';
  }, [selectedModelId]);

  // 영상 모델: 남은 크레딧(초) 계산
  const videoMaxSeconds = useMemo(() => {
    if (!isVideoModel || !selectedModelId) return 50;
    const credits = walletCredits?.[selectedModelId] || 0;
    return Math.min(credits, 50);
  }, [isVideoModel, selectedModelId, walletCredits]);

  const availableModels = useMemo(
    () => models.filter(m => {
      const credits = walletCredits?.[m.id] || 0;
      return credits > 0 && m.enabled;
    }),
    [models, walletCredits]
  );

  const startDraftMessage = useCallback((messageId: string | null) => {
    if (!messageId) return;
    draftContentRef.current = '';
    lastDraftFlushRef.current = 0;
    setDraftMessageId(messageId);
    setDraftContent('');
  }, []);

  const flushDraftMessage = useCallback((content: string, force: boolean = false) => {
    draftContentRef.current = content;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && STREAMING_DRAFT_UI_THROTTLE_MS > 0 && now - lastDraftFlushRef.current < STREAMING_DRAFT_UI_THROTTLE_MS) {
      return;
    }
    lastDraftFlushRef.current = now;
    setDraftContent(content);
  }, []);

  const clearDraftMessage = useCallback(() => {
    draftContentRef.current = '';
    lastDraftFlushRef.current = 0;
    setDraftMessageId(null);
    setDraftContent('');
  }, []);

  const bookmarkedMessageIds = useMemo(
    () => new Set(bookmarkedMessages.map((bookmark) => bookmark.id)),
    [bookmarkedMessages]
  );

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedSessions;
    return sortedSessions.filter((session) => {
      if (session.title.toLowerCase().includes(q)) return true;
      return session.messages.some(
        (m) => typeof m.content === 'string' && m.content.toLowerCase().includes(q)
      );
    });
  }, [sortedSessions, searchQuery]);

  const lastAssistantMsgId = useMemo(() => {
    for (let i = currentMessages.length - 1; i >= 0; i -= 1) {
      if (currentMessages[i].role === 'assistant') {
        return currentMessages[i].id;
      }
    }
    return null;
  }, [currentMessages]);
  
  // Close plus menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  useEffect(() => {
    // 세션이 없으면 새로 생성 (초기 진입 시에만)
    if (!currentSessionId && chatSessions.length === 0) {
      const sessionId = createChatSession('새 대화');
    }
  }, [currentSessionId, chatSessions.length, createChatSession]);

  useEffect(() => {
    if (!currentSessionId && chatSessions.length > 0) {
      setCurrentSession(chatSessions[0].id);
    }
  }, [currentSessionId, chatSessions, setCurrentSession]);

  // 세션 전환 시 로딩 상태 초기화
  useEffect(() => {
    if (sendInFlightRef.current || abortControllerRef.current || streamingRef.current) {
      return;
    }
    setIsLoading(false);
    streamingRef.current = false;
    clearDraftMessage();
    setShowSmartRouterPanel(false);
  }, [currentSessionId, clearDraftMessage]);
  
  // Set default model when available models change (client-side only)
  useEffect(() => {
    if (availableModels.length > 0 && !selectedModelId) {
      setSelectedModelId(availableModels[0].id);
    }
  }, [availableModels, selectedModelId]);

  // 48h 배치 결과 폴링 (30초마다)
  useEffect(() => {
    if (!batchPendingMessageId || !currentSessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/batch/status?sessionId=${currentSessionId}&messageId=${batchPendingMessageId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'completed' && data.result) {
          const extracted = extractMemoryForDisplay(data.result);
          if (extracted.facts.length) addStoredFacts(extracted.facts);
          const pendingRefund = batchPendingRefundRef.current;
          if (pendingRefund?.messageId === batchPendingMessageId) {
            releasePendingRefundToken(pendingRefund.refundToken);
            batchPendingRefundRef.current = null;
          }
          finalizeMessageContent(currentSessionId, batchPendingMessageId, extracted.displayText);
          setBatchPendingMessageId(null);
          clearInterval(interval);
        } else if (data.status === 'failed') {
          const pendingRefund = batchPendingRefundRef.current;
          if (pendingRefund?.messageId === batchPendingMessageId) {
            refundCredit(pendingRefund.modelId, pendingRefund.piWon, pendingRefund.refundToken);
            batchPendingRefundRef.current = null;
          }
          finalizeMessageContent(currentSessionId, batchPendingMessageId, '⚠️ 답변 생성에 실패했습니다. 다시 시도해 주세요.');
          setBatchPendingMessageId(null);
          clearInterval(interval);
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [batchPendingMessageId, currentSessionId, finalizeMessageContent, addStoredFacts, refundCredit, releasePendingRefundToken]);

  // 템플릿에서 "사용하기" 선택 시: 입력창 자동 채움 + 모달 닫기
  useEffect(() => {
    if (!activeTemplate) return;

    setMessage(activeTemplate.prompt || '');
    setShowTemplates(false);
    clearActiveTemplate();
  }, [activeTemplate, clearActiveTemplate]);

  const scrollRafRef = useRef<number | null>(null);
  const scrollToBottom = useCallback((force: boolean = false) => {
    if (!force && userScrolledUpRef.current) return;
    // rAF으로 배치 처리 - 같은 프레임 내 중복 스크롤 제거
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const behavior = force || (streaming?.smoothScrolling && !streamingRef.current) ? 'smooth' : 'auto';
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, [streaming?.smoothScrolling]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [currentMessages.length, scrollToBottom]);

  // textarea 자동 높이 조절
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200; // maxHeight와 동일

    if (scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
    }
  }, [message]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const beforeCount = attachments.length;
    const availableSlots = MAX_ATTACHMENTS - beforeCount;
    
    if (availableSlots <= 0) {
      toast.error(`최대 ${MAX_ATTACHMENTS}개까지 업로드할 수 있어요.`);
      return;
    }
    
    const filesArray = Array.from(files).slice(0, availableSlots);
    
    if (filesArray.length < files.length) {
      toast.error(`최대 ${MAX_ATTACHMENTS}개까지 업로드할 수 있어요. 초과분은 제외됩니다.`);
    }

    const newItems: Attachment[] = [];
    
    for (const file of filesArray) {
      try {
        if (file.type.startsWith('image/')) {
          // canvas로 리사이즈 + 압축 (최대 1024px, 품질 0.75)
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = (e) => {
              const img = new Image();
              img.onerror = reject;
              img.onload = () => {
                const MAX = 1024;
                let { width, height } = img;
                if (width > MAX || height > MAX) {
                  if (width > height) {
                    height = Math.round((height * MAX) / width);
                    width = MAX;
                  } else {
                    width = Math.round((width * MAX) / height);
                    height = MAX;
                  }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(e.target?.result as string); return; }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
              };
              img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
          });
          
          newItems.push({ 
            id: crypto.randomUUID(), 
            name: file.name, 
            type: 'image' as const, 
            dataUrl 
          });
          
        } else if (file.type.startsWith('text/') || file.type === 'application/json') {
          const text = await file.text();
          newItems.push({ 
            id: crypto.randomUUID(), 
            name: file.name, 
            type: 'text' as const, 
            content: text.slice(0, 20000) 
          });
          
        } else {
          toast.error(`지원하지 않는 파일 형식입니다: ${file.name}`);
        }
      } catch {
        toast.error(`파일 처리 중 오류가 발생했습니다: ${file.name}`);
      }
    }
    
    if (newItems.length > 0) {
      setAttachments(prev => [...prev, ...newItems]);
    }
  }, [attachments.length]);

  const handleDownloadImage = useCallback(async (imageUrl: string, filename: string = 'ai-generated-image.png') => {
    try {
      // data URL인 경우 직접 다운로드
      if (imageUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('이미지를 다운로드했습니다!');
        return;
      }

      // 외부 URL인 경우 fetch 시도
      try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('이미지를 다운로드했습니다!');
      } catch (fetchError) {
        // CORS 오류 시 새 탭에서 열기
        window.open(imageUrl, '_blank');
        toast.info('새 탭에서 이미지를 열었습니다. 우클릭하여 저장하세요.');
      }
    } catch {
      toast.error('이미지 다운로드에 실패했습니다.');
    }
  }, []);

  const handleCancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    streamingRef.current = false;
    setIsLoading(false);
    cancelRequestedRef.current = true;
    toast.info('응답 생성이 취소되었습니다.');
  }, []);

  const handleBookmark = useCallback((msgId: string) => {
    if (!currentSessionId) return;
    const session = useStore.getState().chatSessions.find(s => s.id === currentSessionId);
    const msg = session?.messages.find(m => m.id === msgId);
    if (!msg) return;
    const isAlreadyBookmarked = bookmarkedMessageIds.has(msgId);
    if (isAlreadyBookmarked) {
      removeBookmark(msgId);
      toast.success('북마크가 해제되었습니다.');
    } else {
      addBookmark({
        id: msgId,
        sessionId: currentSessionId,
        content: msg.content as string,
        modelId: msg.modelId,
        timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString(),
        sessionTitle: session?.title,
      });
      toast.success('북마크에 저장했습니다.');
    }
  }, [currentSessionId, bookmarkedMessageIds, addBookmark, removeBookmark]);

  const handleTTS = useCallback((content: string) => {
    if (!window.speechSynthesis) { toast.error('이 브라우저는 TTS를 지원하지 않습니다.'); return; }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      toast.info('읽기가 중지되었습니다.');
      return;
    }
    const stripped = stripSummaryBlock(content).replace(/[#*`]/g, '').trim();
    const utter = new SpeechSynthesisUtterance(stripped);
    const utterLang = language === 'en' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'ko-KR';
    utter.lang = utterLang;
    utter.rate = language === 'ko' ? 1.0 : 1.02;
    utter.pitch = 1.02;
    utter.volume = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferredNames = language === 'ko'
        ? ['sunhi', 'yuna', 'sora', 'heami', 'seoyeon', 'google']
        : language === 'ja'
          ? ['kyoko', 'otoya', 'google', 'microsoft']
          : ['samantha', 'aria', 'jenny', 'guy', 'google', 'microsoft'];
      const preferredVoice = [...voices]
        .filter(v => v.lang.toLowerCase().startsWith(utterLang.slice(0, 2).toLowerCase()))
        .sort((a, b) => {
          const scoreVoice = (voice: SpeechSynthesisVoice) => {
            const lowerName = voice.name.toLowerCase();
            let score = 0;
            if (!voice.localService) score += 20;
            if (lowerName.includes('natural')) score += 15;
            if (lowerName.includes('premium')) score += 10;
            if (lowerName.includes('enhanced')) score += 10;
            preferredNames.forEach((keyword, index) => {
              if (lowerName.includes(keyword)) {
                score += 100 - index;
              }
            });
            return score;
          };
          return scoreVoice(b) - scoreVoice(a);
        })[0];
      if (preferredVoice) utter.voice = preferredVoice;
    }
    
    ttsRef.current = utter;
    window.speechSynthesis.speak(utter);
    toast.info('읽기 시작 — 다시 클릭하면 중지됩니다.');
  }, [language]);

  const handleExportChat = useCallback((format: 'markdown' | 'txt') => {
    const session = useStore.getState().chatSessions.find(s => s.id === currentSessionId);
    if (!session || session.messages.length === 0) { toast.error('내보낼 대화가 없습니다.'); return; }
    const lines: string[] = [];
    if (format === 'markdown') {
      lines.push(`# ${session.title}\n`);
      session.messages.forEach(m => {
        const role = m.role === 'user' ? '**나**' : `**${modelById.get(m.modelId || '') ?.displayName || 'AI'}**`;
        const content = stripSummaryBlock(m.content as string);
        if (content.startsWith('__VIDEO__:')) {
          lines.push(`${role}: [생성된 영상]\n`);
        } else if (content.startsWith('http') || content.startsWith('data:image')) {
          lines.push(`${role}: ![생성된 이미지](${content})\n`);
        } else {
          lines.push(`${role}:\n${content}\n`);
        }
      });
    } else {
      lines.push(`${session.title}\n${'='.repeat(40)}\n`);
      session.messages.forEach(m => {
        const role = m.role === 'user' ? '나' : (modelById.get(m.modelId || '')?.displayName || 'AI');
        const content = stripSummaryBlock(m.content as string);
        lines.push(`[${role}]\n${content}\n`);
      });
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title}.${format === 'markdown' ? 'md' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${format === 'markdown' ? 'Markdown' : 'TXT'}으로 내보냈습니다!`);
  }, [currentSessionId, modelById]);

  const handleRegenerate = useCallback(async (withModelId?: string) => {
    if (sendInFlightRef.current || isLoading || streamingRef.current) return;
    if (!currentSessionId) return;
    const session = useStore.getState().chatSessions.find(s => s.id === currentSessionId);
    if (!session) return;
    const messages = session.messages;
    let realIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') {
        realIdx = i;
        break;
      }
    }
    if (realIdx === -1) return;
    const lastAssistant = messages[realIdx];
    let hasUserMessage = false;
    for (let i = realIdx - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        hasUserMessage = true;
        break;
      }
    }
    if (!hasUserMessage) return;
    const targetModelId = withModelId || lastAssistant.modelId || selectedModelId;
    if (!targetModelId) return;
    const targetPiWon = modelById.get(targetModelId)?.piWon ?? 1;
    const credits = walletCredits?.[targetModelId] || 0;
    if (credits <= 0) { toast.error(`${modelById.get(targetModelId)?.displayName} 크레딧이 부족합니다.`); return; }
    let regenerateRefundToken: string | false = false;
    sendInFlightRef.current = true;
    setIsLoading(true);
    streamingRef.current = true;
    cancelRequestedRef.current = false;
    startDraftMessage(lastAssistant.id);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const apiMessages = messages.slice(0, realIdx).map(m => ({ role: m.role, content: m.content }));
      regenerateRefundToken = await deductCredit(targetModelId);
      if (!regenerateRefundToken) throw new Error('ERR_CREDIT_00');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, modelId: targetModelId, temperature, language, speechLevel }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const { errorCode, errorReason } = await readApiErrorResponse(res);
        const apiError = new Error(errorCode) as Error & { detail?: string };
        apiError.detail = errorReason;
        throw apiError;
      }
      const nextContent = await readChatSuccessResponse(res);
      const extracted = extractMemoryForDisplay(nextContent);
      if (extracted.facts.length) {
        addStoredFacts(extracted.facts);
      }
      if (regenerateRefundToken) {
        releasePendingRefundToken(regenerateRefundToken);
        regenerateRefundToken = false;
      }
      flushDraftMessage(extracted.displayText, true);
      finalizeMessageContent(currentSessionId, lastAssistant.id, extracted.displayText);
    } catch (e: any) {
      if (e?.message !== 'ERR_CANCELLED' && regenerateRefundToken) {
        refundCredit(targetModelId, targetPiWon, regenerateRefundToken);
      }
      if (e.name !== 'AbortError') toast.error('재생성에 실패했습니다.');
    } finally {
      clearDraftMessage();
      setIsLoading(false);
      streamingRef.current = false;
      abortControllerRef.current = null;
      sendInFlightRef.current = false;
    }
  }, [currentSessionId, selectedModelId, walletCredits, modelById, finalizeMessageContent, deductCredit, refundCredit, releasePendingRefundToken, temperature, language, speechLevel, startDraftMessage, flushDraftMessage, clearDraftMessage, isLoading, addStoredFacts]);

  const handleSendMessage = useCallback(async () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || !selectedModelId || !selectedModel) {
      return;
    }

    if (sendInFlightRef.current || streamingRef.current || isLoading) {
      return;
    }

    // 이미지 생성 중에는 메시지 전송 차단
    if (isLoading && (selectedModelId === 'gptimage1' || selectedModelId === 'dalle3')) {
      toast.error('이미지 생성 중입니다. 잠시만 기다려주세요.');
      return;
    }

    if (trimmedMessage.length > selectedModelMaxCharacters) {
      toast.error(`메시지가 너무 깁니다. 최대 ${selectedModelMaxCharacters.toLocaleString()}자까지 보낼 수 있어요.`);
      return;
    }

    const credits = walletCredits?.[selectedModelId] || 0;
    if (credits <= 0) {
      toast.error(`${selectedModel.displayName} 크레딧이 부족합니다.`);
      return;
    }

    const chatPerfRunId = startChatPerfRun('handleSendMessage', STREAMING_DRAFT_V2);
    
    sendInFlightRef.current = true;
    setIsLoading(true);
    streamingRef.current = true;
    cancelRequestedRef.current = false;
    
    // 현재 선택된 모델 ID를 고정 (출력 중 모델 선택이 바뀌어도 메시지의 모델은 유지)
    const currentModelId = selectedModelId;
    const currentModelPiWon = modelById.get(currentModelId)?.piWon ?? 1;
    
    let sessionIdForThisRequest = currentSessionId;
    if (!sessionIdForThisRequest) {
      const created = createChatSession('새 대화');
      sessionIdForThisRequest = created || useStore.getState().currentSessionId;
    }

    if (!sessionIdForThisRequest) {
      sendInFlightRef.current = false;
      streamingRef.current = false;
      setIsLoading(false);
      toast.error('대화를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    const assistantMessageId = sessionIdForThisRequest ? crypto.randomUUID() : null;
    let capturedRefundToken: string | false = false;

    try {
      const msg = trimmedMessage;
      const composerDraftStorageKeyForRequest = composerDraftStorageKey;
      removeComposerDraft(composerDraftStorageKeyForRequest);
      setMessage('');
      
      // API 호출을 위한 메시지 준비 (크레딧 차감 전에 먼저 준비)
      const liveState = useStore.getState();
      const sessionForThisRequest = sessionIdForThisRequest
        ? liveState.chatSessions.find((s: any) => s.id === sessionIdForThisRequest)
        : null;
      const currentMessages = sessionForThisRequest?.messages || [];
      const newUserMessage = {
        role: 'user' as const,
        content: msg
      };
      
      // 전체 대화 내역 (이전 메시지 + 새 메시지)
      const apiMessages = [
        ...currentMessages.map(m => ({
          role: m.role,
          content: m.content
        })),
        newUserMessage
      ];

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Chat] Sending messages to API:', {
          totalMessages: apiMessages.length,
          lastMessage: apiMessages[apiMessages.length - 1]
        });
      }
      
      // 사용자 메시지를 세션에 즉시 추가 (UI 먼저 업데이트)
      if (sessionIdForThisRequest) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Chat] Adding user message to session:', sessionIdForThisRequest);
        }
        addMessage(sessionIdForThisRequest, {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content: msg,
          timestamp: new Date().toISOString(),
        });
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[Chat] No session ID - cannot add user message');
        }
      }

      if (sessionIdForThisRequest && assistantMessageId) {
        addMessage(sessionIdForThisRequest, {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: '',
          modelId: currentModelId,
          timestamp: new Date().toISOString(),
          creditUsed: 1
        });
        if (STREAMING_DRAFT_V2) {
          startDraftMessage(assistantMessageId);
        }
      }
      
      // UI 업데이트 후 스크롤 (한 번만)
      scrollToBottom(true);
      
      // 크레딧 차감 후 환불 토큰 저장 (에러 시 환불에 사용)
      try {
        capturedRefundToken = await deductCredit(currentModelId);
      } catch (err) {
        console.error('[Chat] Credit deduction failed:', err);
      }
      if (!capturedRefundToken) {
        const creditError = new Error('ERR_CREDIT_00') as Error & { detail?: string };
        creditError.detail = '크레딧 차감에 실패해서 요청을 보내지 않았어요.';
        throw creditError;
      }

      // 48h 배치 모델: 별도 처리
      if (isBatchModel && sessionIdForThisRequest && assistantMessageId) {
        try {
          const batchRes = await fetch('/api/batch/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId: currentModelId,
              messages: apiMessages,
              sessionId: sessionIdForThisRequest,
              messageId: assistantMessageId,
              language,
              speechLevel: useStore.getState().speechLevel,
            }),
          });
          if (batchRes.ok) {
            if (capturedRefundToken) {
              batchPendingRefundRef.current = {
                messageId: assistantMessageId,
                modelId: currentModelId,
                piWon: currentModelPiWon,
                refundToken: capturedRefundToken,
              };
            }
            finalizeMessageContent(sessionIdForThisRequest, assistantMessageId, '⏳ 답변을 준비 중입니다. 최대 48시간 내에 답변이 도착합니다.');
            setBatchPendingMessageId(assistantMessageId);
          } else {
            const { errorReason } = await readApiErrorResponse(batchRes);
            if (capturedRefundToken) {
              refundCredit(currentModelId, currentModelPiWon, capturedRefundToken);
              capturedRefundToken = false;
            }
            finalizeMessageContent(sessionIdForThisRequest, assistantMessageId, errorReason || '요청 전송에 실패했습니다. 다시 시도해 주세요.');
            setBatchPendingMessageId(null);
          }
        } catch {
          if (capturedRefundToken) {
            refundCredit(currentModelId, currentModelPiWon, capturedRefundToken);
            capturedRefundToken = false;
          }
          finalizeMessageContent(sessionIdForThisRequest, assistantMessageId, '요청 전송에 실패했습니다. 다시 시도해 주세요.');
        }
        setIsLoading(false);
        streamingRef.current = false;
        return;
      }

      // API 호출 (500/503 에러 시 1.5초 후 1회 자동 재시도)
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestTimeout = isVideoModel ? 300000 : 300000; // 영상: 5분, 일반: 5분
      const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      const requestPayload = {
        messages: apiMessages,
        modelId: currentModelId,
        temperature,
        maxTokens: 4096,
        language,
        speechLevel,
        storedFacts,
        conversationSummary: conversationSummaries.length > 0 ? buildConversationContext(conversationSummaries) : undefined,
        persona: activePersona ? {
          name: activePersona.name,
          personality: activePersona.personality,
          expertise: activePersona.expertise,
          speechPatterns: activePersona.speechPatterns
        } : undefined,
        videoSeconds: isVideoModel ? videoSeconds : undefined,
        userAttachments: attachments.map(a => ({
          type: a.type,
          name: a.name,
          dataUrl: a.dataUrl,
          content: a.content
        }))
      };
      const serializedRequestBody = JSON.stringify(requestPayload);
      if (getTextByteSize(serializedRequestBody) > REQUEST_BODY_SIZE_LIMIT_BYTES) {
        const payloadError = new Error('ERR_REQ_00') as Error & { detail?: string };
        payloadError.detail = '요청 크기가 너무 커서 보낼 수 없어요. 첨부파일 수나 대화 길이를 줄여주세요.';
        throw payloadError;
      }
      const requestHeaders = { 'Content-Type': 'application/json' };

      let response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: requestHeaders,
          body: serializedRequestBody,
          signal: controller.signal
        });
        // 500/503 서버 에러 시 1.5초 후 1회 자동 재시도
        if ((response.status === 500 || response.status === 503) && !cancelRequestedRef.current) {
          await new Promise(r => setTimeout(r, 1500));
          response = await fetch('/api/chat', {
            method: 'POST',
            headers: requestHeaders,
            body: serializedRequestBody,
            signal: controller.signal
          });
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          if (cancelRequestedRef.current) {
            throw new Error('ERR_CANCELLED');
          }
          throw new Error('ERR_TIMEOUT');
        }
        throw new Error('ERR_NET_00');
      }
      clearTimeout(timeoutId);

      if (process.env.NODE_ENV !== 'production') {
        console.log('API Response status:', response.status);
        console.log('Content-Type:', response.headers.get('content-type'));
      }
      
      if (!response.ok) {
        const { errorCode, errorReason } = await readApiErrorResponse(response);

        if (process.env.NODE_ENV !== 'production') {
          console.error('API Error:', errorCode, 'Status:', response.status, 'Reason:', errorReason);
        }
        const apiError = new Error(errorCode) as Error & { detail?: string };
        apiError.detail = errorReason;
        throw apiError;
      }
      
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // GPT 스트리밍 SSE 응답 처리
        // 혁신적 최적화: 네트워크 읽기와 UI 업데이트를 완전히 분리
        // - 읽기 루프: 최대 속도로 텍스트 누적 (블로킹 없음)
        // - RAF 루프: 브라우저 렌더 타이밍에 맞춰 한 프레임에 한 번만 DOM 업데이트
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let sseBuffer = '';
        let rafPending = false;
        let streamDone = false;
        let streamError: Error | null = null;
        let lastRenderedContent = '';

        // RAF 기반 UI 업데이트 루프 (브라우저 vsync에 정확히 동기화)
        const rafUpdate = () => {
          if (accumulated !== lastRenderedContent && sessionIdForThisRequest && assistantMessageId) {
            lastRenderedContent = accumulated;
            if (STREAMING_DRAFT_V2) {
              flushDraftMessage(accumulated);
            } else {
              updateMessageContent(sessionIdForThisRequest, assistantMessageId, accumulated);
            }
            scrollToBottom(false);
          }
          rafPending = false;
          if (!streamDone) {
            rafPending = true;
            requestAnimationFrame(rafUpdate);
          }
        };
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const jsonStr = trimmed.slice(6);
              if (jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) throw new Error(parsed.error);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  accumulated += delta;
                  // 첫 토큰: RAF 루프 시작 (이후는 자동으로 vsync에 맞춰 업데이트)
                  if (!rafPending) {
                    rafPending = true;
                    requestAnimationFrame(rafUpdate);
                  }
                }
              } catch (parseErr: any) {
                if (parseErr.message && !parseErr.message.includes('JSON')) {
                  streamError = parseErr;
                  break;
                }
              }
            }
            if (streamError) break;
          }
          
          // 스트림 완료: RAF 루프 종료 후 최종 내용 반영
          streamDone = true;
          if (accumulated !== lastRenderedContent && sessionIdForThisRequest && assistantMessageId) {
            if (STREAMING_DRAFT_V2) {
              flushDraftMessage(accumulated, true);
            } else {
              updateMessageContent(sessionIdForThisRequest, assistantMessageId, accumulated);
            }
            scrollToBottom(false);
          }
          if (streamError) throw streamError;
        } catch (streamReadError: any) {
          if (streamReadError?.name === 'AbortError' || cancelRequestedRef.current) {
            throw new Error('ERR_CANCELLED');
          }
          throw streamReadError;
        } finally {
          reader.releaseLock();
        }
        
        // 스트리밍 완료 후 응답 처리
        if (accumulated && accumulated.trim()) {
          // 정상 응답: 메모리/요약 추출
          const extracted = extractMemoryForDisplay(accumulated);
          if (extracted.facts.length) {
            addStoredFacts(extracted.facts);
          }
          if (sessionIdForThisRequest && assistantMessageId) {
            if (STREAMING_DRAFT_V2) {
              flushDraftMessage(extracted.displayText, true);
            }
            finalizeMessageContent(sessionIdForThisRequest, assistantMessageId, extracted.displayText);
          }
        } else if (!streamError) {
          // 에러 없이 빈 응답인 경우만 에러 처리
          const fallback = language === 'en'
            ? 'Response was interrupted. Please try again.'
            : '응답이 중단되었어요. 다시 시도해 주세요.';
          if (sessionIdForThisRequest && assistantMessageId) {
            if (STREAMING_DRAFT_V2) {
              flushDraftMessage(fallback, true);
            } else {
              updateMessageContent(sessionIdForThisRequest, assistantMessageId, fallback);
            }
          }
          throw new Error('ERR_EMPTY_01');
        }
        try {
          const { summary } = extractSummary(accumulated);
          if (summary) {
            setConversationSummaries(prev => [...prev, summary]);
          }
        } catch {}
        
      } else {
        // JSON 응답 처리 (Claude, Perplexity, Codex, 이미지 등)
        let data;
        try {
          data = await response.json();
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to parse response:', e);
          }
          throw new Error('ERR_RESP_00');
        }
        
        if (!data || !data.content) {
          const fallback = language === 'en'
            ? 'Response was interrupted. Please try again.'
            : '응답이 중단되었어요. 다시 시도해 주세요.';
          if (process.env.NODE_ENV !== 'production') {
            console.error('Empty response from API:', data);
          }
          if (sessionIdForThisRequest && assistantMessageId) {
            updateMessageContent(sessionIdForThisRequest, assistantMessageId, fallback);
          }
          throw new Error('ERR_EMPTY_00');
        }
        
        const extracted = extractMemoryForDisplay(data.content);
        if (extracted.facts.length) {
          addStoredFacts(extracted.facts);
        }
        if (sessionIdForThisRequest && assistantMessageId) {
          if (STREAMING_DRAFT_V2) {
            flushDraftMessage(extracted.displayText, true);
          }
          finalizeMessageContent(sessionIdForThisRequest, assistantMessageId, extracted.displayText);
          setTimeout(() => scrollToBottom(true), 100);
        }
        try {
          const { summary } = extractSummary(data.content);
          if (summary) {
            setConversationSummaries(prev => [...prev, summary]);
          }
        } catch (summaryError) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Summary extraction failed:', summaryError);
          }
        }
      }

      if (capturedRefundToken) {
        releasePendingRefundToken(capturedRefundToken);
        capturedRefundToken = false;
      }
      
      setAttachments([]);
      // toast.success(`${model.displayName} 크레딧 1회 사용 (잔여: ${credits - 1}회)`);
      
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Chat error:', error);
      }
      
      let errorCode = error.message || 'ERR_UNKNOWN';
      const errorDetail = typeof error?.detail === 'string' ? error.detail : undefined;
      const rawErrorText = `${errorCode} ${errorDetail || ''}`.toLowerCase();
      if (
        error?.name === 'AbortError' ||
        rawErrorText.includes('err_cancelled') ||
        rawErrorText.includes('body stream buffer was aborted') ||
        rawErrorText.includes('bodystreambuffer was aborted') ||
        rawErrorText.includes('aborted')
      ) {
        errorCode = 'ERR_CANCELLED';
      }

      const sid = sessionIdForThisRequest || useStore.getState().currentSessionId;

      // 429 에러: 대기/나가기 선택 흐름
      if (errorCode.startsWith('ERR_RATE')) {
        const waitContent = `현재 AI 요청이 많아 응답이 지연되고 있어요.\n\n이대로 기다리시면 1분 30초 안에 답변이 올 수 있어요. 계속 기다리시겠어요?`;
        if (sid) {
          if (assistantMessageId) {
            finalizeMessageContent(sid, assistantMessageId, waitContent);
          } else {
            addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: waitContent, modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 0 });
          }
        }

        const userChoice = await new Promise<'wait' | 'leave'>((resolve) => {
          let resolved = false;
          const rateToastId = `rate-limit-${Date.now()}`;
          const finish = (choice: 'wait' | 'leave') => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(autoResolveId);
            toast.dismiss(rateToastId);
            resolve(choice);
          };
          const autoResolveId = window.setTimeout(() => finish('leave'), 90000);
          toast.custom(
            () => (
              <div className="flex flex-col gap-2 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">현재 AI 요청이 많아 지연 중</span>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => finish('wait')}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium"
                  >기다리기</button>
                  <button
                    onClick={() => finish('leave')}
                    className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded text-xs font-medium"
                  >나가기 (크레딧 1회 보상)</button>
                </div>
              </div>
            ),
            { duration: 90000, id: rateToastId }
          );
        });

        if (userChoice === 'leave') {
          if (capturedRefundToken) {
            releasePendingRefundToken(capturedRefundToken);
            capturedRefundToken = false;
          }
          if (currentModelId) await addCredits({ [currentModelId]: 1 });
          if (sid) {
            const modelName = selectedModel?.displayName || currentModelId || 'AI';
            addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: `응답을 중단했어요. 불편을 드려 죄송해요. ${modelName} 크레딧 1회를 보상해드렸어요.`, modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 0 });
          }
        } else {
          // 90초 대기 후 재시도
          await new Promise(r => setTimeout(r, 90000));
          try {
            const liveMessages = useStore.getState().chatSessions.find(s => s.id === sid)?.messages || [];
            const retryBody = JSON.stringify({ modelId: currentModelId, messages: liveMessages.filter((m: any) => m.role !== 'assistant' || m.content).map((m: any) => ({ role: m.role, content: m.content })) });
            const retryResp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: retryBody });
            if (!retryResp.ok) {
              if (retryResp.status === 429) {
                if (capturedRefundToken) {
                  releasePendingRefundToken(capturedRefundToken);
                  capturedRefundToken = false;
                }
                if (currentModelId) await addCredits({ [currentModelId]: 3 });
                const modelName = selectedModel?.displayName || currentModelId || 'AI';
                if (sid) addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: `현재 대기 중인 사용자가 너무 많아 응답이 어려워요. 진심으로 죄송합니다. ${modelName} 크레딧 3회를 보상해드렸어요.`, modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 0 });
              } else {
                const { errorReason } = await readApiErrorResponse(retryResp);
                if (capturedRefundToken) {
                  refundCredit(currentModelId, currentModelPiWon, capturedRefundToken);
                  capturedRefundToken = false;
                }
                if (sid) addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: errorReason || '재시도에 실패했습니다. 다시 시도해 주세요.', modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 0 });
              }
            } else {
              const retryContent = await readChatSuccessResponse(retryResp);
              const extracted = extractMemoryForDisplay(retryContent);
              if (extracted.facts.length) addStoredFacts(extracted.facts);
              if (capturedRefundToken) {
                releasePendingRefundToken(capturedRefundToken);
                capturedRefundToken = false;
              }
              if (sid) {
                addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: extracted.displayText, modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 0 });
              }
            }
          } catch {
            if (capturedRefundToken) {
              refundCredit(currentModelId, currentModelPiWon, capturedRefundToken);
              capturedRefundToken = false;
            }
          }
        }
        return;
      }

      // ERR_CANCELLED가 아닌 실제 에러 시 크레딧 환불
      if (errorCode !== 'ERR_CANCELLED' && currentModelId && capturedRefundToken) {
        refundCredit(currentModelId, currentModelPiWon, capturedRefundToken);
      }
      
      // 에러코드 → 사용자 친화적 메시지 매핑
      const getErrorDisplay = (code: string): { title: string; icon: string; message: string; tips: string[] } => {
        if (code === 'ERR_CANCELLED') return { icon: '', title: '', message: '', tips: [] };
        if (code === 'ERR_TIMEOUT' || code.includes('504') || code.includes('Timeout')) {
          return { icon: '⏱️', title: '응답 시간 초과', message: 'AI가 응답하는 데 시간이 너무 오래 걸렸어요.', tips: ['더 짧은 질문으로 다시 시도해보세요', '잠시 후 다시 시도해주세요'] };
        }
        if (code.startsWith('ERR_SESSION')) {
          return { icon: '🗂️', title: '대화를 준비하지 못했어요', message: '새 대화를 만드는 중 문제가 생겨 요청을 시작하지 못했어요.', tips: ['잠시 후 다시 시도해주세요', '새 채팅 버튼을 눌러 다시 시작해보세요'] };
        }
        if (code.startsWith('ERR_CREDIT')) {
          return { icon: '💳', title: '크레딧 처리 오류', message: '크레딧 상태를 확인하지 못해 요청을 안전하게 중단했어요.', tips: ['보유 크레딧을 확인해주세요', '잠시 후 다시 시도해주세요'] };
        }
        if (code.startsWith('ERR_REQ')) {
          return { icon: '🧾', title: '요청을 보낼 수 없어요', message: '보내는 데이터가 너무 크거나 형식이 올바르지 않았어요.', tips: ['질문을 조금 더 짧게 나눠서 보내보세요', '첨부파일 수나 크기를 줄여주세요'] };
        }
        if (code.startsWith('ERR_CONFIG')) {
          return { icon: '🛠️', title: '모델 설정 오류', message: '현재 이 AI 모델 설정에 문제가 있어 요청을 처리할 수 없어요.', tips: ['잠시 후 다시 시도해주세요', '문제가 계속되면 관리자에게 문의해주세요'] };
        }
        if (code === 'ERR_AUTH') {
          return { icon: '🔐', title: '로그인이 필요해요', message: '로그인한 사용자만 AI 기능을 사용할 수 있어요.', tips: ['로그인 후 다시 시도해주세요', '로그인 상태가 풀렸다면 다시 로그인해주세요'] };
        }
        if (code.startsWith('ERR_KEY')) {
          return { icon: '🔧', title: '서비스 점검 중', message: '현재 이 AI 모델의 서비스를 일시적으로 이용할 수 없어요.', tips: ['다른 AI 모델을 선택해보세요', '잠시 후 다시 시도해주세요'] };
        }
        if (code.startsWith('ERR_NET')) {
          return { icon: '🌐', title: '연결 오류', message: 'AI 서버와 연결하는 데 문제가 발생했어요.', tips: ['인터넷 연결을 확인해주세요', '잠시 후 다시 시도해주세요'] };
        }
        if (code.startsWith('ERR_EMPTY') || code.startsWith('ERR_RESP')) {
          return { icon: '💬', title: 'AI가 응답하지 못했어요', message: 'AI가 적절한 답변을 생성하지 못했어요.', tips: ['질문을 다시 한번 보내보세요', '다른 방식으로 질문해보세요'] };
        }
        if (code.startsWith('ERR_SAFE')) {
          return { icon: '🛡️', title: '요청을 처리할 수 없어요', message: '입력하신 내용이 AI 이용 정책에 맞지 않아 처리할 수 없었어요.', tips: ['표현을 바꿔서 다시 시도해보세요', '민감한 내용은 피해주세요'] };
        }
        return { icon: '⚠️', title: '일시적인 오류가 발생했어요', message: '요청을 처리하는 중 문제가 발생했어요.', tips: ['잠시 후 다시 시도해주세요', '문제가 계속되면 다른 모델을 이용해보세요'] };
      };

      const display = getErrorDisplay(errorCode);
      
      if (sid) {
        let errContent;
        if (errorCode === 'ERR_CANCELLED') {
          errContent = '<span style="color: #9ca3af; font-style: italic;">응답 중지됨</span>';
        } else {
          errContent = `${display.icon} **${display.title}**\n\n${display.message}${errorDetail ? `\n\n**원인:** ${errorDetail}` : ''}\n\n**이렇게 해보세요:**\n${display.tips.map(t => '• ' + t).join('\n')}\n\n문제가 계속되면 **관리자에게 문의**해주세요.\n\n\`${errorCode}\``;
        }
        if (assistantMessageId) {
          finalizeMessageContent(sid, assistantMessageId, errContent);
        } else {
          addMessage(sid, { id: crypto.randomUUID(), role: 'assistant' as const, content: errContent, modelId: currentModelId, timestamp: new Date().toISOString(), creditUsed: 1 });
        }
      }
      
      if (errorCode !== 'ERR_CANCELLED') {
        const refundNote = useStore.getState().insurancePurchased
          ? ' (보험 적용 크레딧 환불 완료)'
          : ' (크레딧 1회 환불 완료)';
        toast.error(display.message + refundNote);
      }
    } finally {
      clearDraftMessage();
      setIsLoading(false);
      streamingRef.current = false;
      abortControllerRef.current = null;
      cancelRequestedRef.current = false;
      sendInFlightRef.current = false;
      // 전송 후 첨부파일 완전 초기화
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // 스트리밍 종료 시 자동스크롤 토스트 닫기
      if (autoScrollToastIdRef.current !== null) {
        toast.dismiss(autoScrollToastIdRef.current);
        autoScrollToastIdRef.current = null;
      }
      if (chatPerfRunId) {
        requestAnimationFrame(() => {
          endChatPerfRun(chatPerfRunId);
        });
      }
    }
  }, [message, selectedModelId, selectedModel, selectedModelMaxCharacters, walletCredits, currentSessionId, deductCredit, refundCredit, releasePendingRefundToken, addMessage, addCredits, attachments, temperature, language, activePersona, storedFacts, updateMessageContent, finalizeMessageContent, scrollToBottom, conversationSummaries, isBatchModel, isVideoModel, videoSeconds, startDraftMessage, flushDraftMessage, clearDraftMessage, createChatSession, isLoading, modelById, addStoredFacts, composerDraftStorageKey, removeComposerDraft]);
  
  const handleNewChat = useCallback(() => {
    if (isOnCooldown) return;
    
    // 항상 쿨다운 시작
    setIsOnCooldown(true);
    
    // 1.3초 후에 쿨다운 종료
    setTimeout(() => setIsOnCooldown(false), 1300);
    
    // 현재 입력창 내용 캡처 (전송 전 상태)
    const pendingMessage = message;
    const pendingAttachments = attachments;
    
    // 새 대화 생성 시도
    const sessionId = createChatSession('새 대화 ' + (chatSessions.length + 1));
    
    if (sessionId) {
      if (currentSessionId) {
        removeComposerDraft(getComposerDraftStorageKey(currentSessionId));
      }
      persistComposerDraft(getComposerDraftStorageKey(sessionId), pendingMessage);
      setCurrentSession(sessionId);
      // 기존 입력 내용을 새 채팅으로 이전
      setMessage(pendingMessage);
      setAttachments(pendingAttachments);
    }
  }, [isOnCooldown, chatSessions.length, createChatSession, setCurrentSession, message, attachments, currentSessionId, getComposerDraftStorageKey, persistComposerDraft, removeComposerDraft]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // AI 답변 중이거나 로딩 중이면 전송 차단
      if (streamingRef.current || isLoading) {
        return;
      }
      handleSendMessage();
    }
  }, [handleSendMessage, isLoading]);
  
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  }, []);

  // 코드 복사 핸들러
  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('코드가 복사되었습니다');
  }, []);

  // LaTeX, 코드 블록(```), 그래프(&&&) 처리하는 함수
  const formatMessage = useCallback((text: string) => {
    // 메모리 블록 제거
    let processedText = extractMemoryForDisplay(text).displayText;
    
    // ~~로 둘러싸인 요약 부분 제거
    const summaryStartIndex = processedText.indexOf('~~');
    if (summaryStartIndex !== -1) {
      const afterStart = processedText.slice(summaryStartIndex + 2);
      const summaryEndIndex = afterStart.indexOf('~~');
      if (summaryEndIndex !== -1) {
        processedText = processedText.slice(0, summaryStartIndex).trim();
      }
    }
    
    const elements: JSX.Element[] = [];
    let currentIndex = 0;
    
    // 1) &&& 그래프 블록
    const graphRegex = /&&&([\s\S]*?)&&&/g;
    // 2) ``` 코드 블록
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    // 3) $$ LaTeX 블록
    const latexBlockRegex = /\$\$([\s\S]*?)\$\$/g;
    // 4) $ LaTeX 인라인
    const latexInlineRegex = /\$(.+?)\$/g;
    // 5) /// 레거시 코드 블록
    const legacyCodeRegex = /\/\/\/([\s\S]*?)\/\/\//g;
    
    // 모든 매치 수집 후 정렬
    const allMatches: Array<{start: number, end: number, type: string, match: any}> = [];
    
    let m;
    while ((m = graphRegex.exec(processedText)) !== null) {
      allMatches.push({start: m.index, end: m.index + m[0].length, type: 'graph', match: m});
    }
    while ((m = codeBlockRegex.exec(processedText)) !== null) {
      allMatches.push({start: m.index, end: m.index + m[0].length, type: 'codeBlock', match: m});
    }
    while ((m = latexBlockRegex.exec(processedText)) !== null) {
      allMatches.push({start: m.index, end: m.index + m[0].length, type: 'latexBlock', match: m});
    }
    while ((m = legacyCodeRegex.exec(processedText)) !== null) {
      allMatches.push({start: m.index, end: m.index + m[0].length, type: 'legacyCode', match: m});
    }
    
    allMatches.sort((a, b) => a.start - b.start);
    
    allMatches.forEach(({start, end, type, match}, idx) => {
      // 이전 텍스트 처리 (LaTeX 인라인 포함)
      if (start > currentIndex) {
        const beforeText = processedText.slice(currentIndex, start);
        elements.push(
          <div key={`text-${currentIndex}`}>
            {formatTextWithInlineLatex(beforeText)}
          </div>
        );
      }
      
      // 블록 렌더링
      if (type === 'graph') {
        elements.push(<GraphRenderer key={`graph-${idx}`} text={match[1]} />);
      } else if (type === 'codeBlock') {
        const lang = match[1] || 'text';
        const code = match[2];
        elements.push(
          <div key={`code-${idx}`} className="relative my-3 group">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-t-lg border-b border-gray-300 dark:border-gray-600">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{lang}</span>
              <button
                onClick={() => handleCopyCode(code)}
                className="p-1.5 bg-white dark:bg-gray-600 rounded-md shadow-sm border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
                title="코드 복사"
              >
                <Copy className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <pre className="bg-gray-100 dark:bg-gray-800 rounded-b-lg p-4 overflow-x-auto border border-t-0 border-gray-300 dark:border-gray-600">
              <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{code}</code>
            </pre>
          </div>
        );
      } else if (type === 'latexBlock') {
        const latex = match[1];
        elements.push(
          <div key={`latex-${idx}`} className="my-3 text-center overflow-x-auto" dangerouslySetInnerHTML={{__html: renderLatex(latex)}} />
        );
      } else if (type === 'legacyCode') {
        const code = match[1].trim();
        elements.push(
          <div key={`legacy-${idx}`} className="relative my-3 group">
            <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto border border-gray-300 dark:border-gray-600">
              <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{code}</code>
            </pre>
            <button
              onClick={() => handleCopyCode(code)}
              className="absolute top-2 right-2 p-2 bg-white dark:bg-gray-700 rounded-md shadow-sm border border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 dark:hover:bg-gray-600"
              title="코드 복사"
            >
              <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        );
      }
      
      currentIndex = end;
    });
    
    // 마지막 남은 텍스트
    if (currentIndex < processedText.length) {
      const remainingText = processedText.slice(currentIndex);
      elements.push(
        <div key={`text-${currentIndex}`}>
          {formatTextWithInlineLatex(remainingText)}
        </div>
      );
    }
    
    return <>{elements}</>;
    
    // 인라인 LaTeX 처리 헬퍼
    function formatTextWithInlineLatex(txt: string) {
      const parts: any[] = [];
      let lastIdx = 0;
      const inlineRegex = /\$(.+?)\$/g;
      let inlineMatch;
      while ((inlineMatch = inlineRegex.exec(txt)) !== null) {
        if (inlineMatch.index > lastIdx) {
          parts.push(formatNormalText(txt.slice(lastIdx, inlineMatch.index)));
        }
        parts.push(
          <span key={`latex-inline-${inlineMatch.index}`} dangerouslySetInnerHTML={{__html: renderLatex(inlineMatch[1])}} />
        );
        lastIdx = inlineMatch.index + inlineMatch[0].length;
      }
      if (lastIdx < txt.length) {
        parts.push(formatNormalText(txt.slice(lastIdx)));
      }
      return <>{parts}</>;
    }
  }, [handleCopyCode]);
  
  // 일반 텍스트 포맷팅 (볼드, 제목, 표)
  const formatNormalText = useCallback((text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // 마크다운 표 감지 (|로 시작하는 줄)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = [];
        let j = i;
        
        // 연속된 표 줄 수집
        while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
          tableLines.push(lines[j]);
          j++;
        }
        
        // 표가 최소 2줄 이상이어야 함 (헤더 + 구분선 또는 헤더 + 데이터)
        if (tableLines.length >= 2) {
          const headers = tableLines[0].split('|').map(h => h.trim()).filter(Boolean);
          const rows: string[][] = [];
          
          // 구분선(---)이 있는지 확인하고 건너뛰기
          let dataStartIndex = 1;
          if (tableLines[1].includes('---') || tableLines[1].includes('--')) {
            dataStartIndex = 2;
          }
          
          // 데이터 행 파싱
          for (let k = dataStartIndex; k < tableLines.length; k++) {
            const cells = tableLines[k].split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length > 0) {
              rows.push(cells);
            }
          }
          
          // 셀 내용 포맷팅 함수 (볼드 처리)
          const formatCellContent = (text: string) => {
            const parts = text.split(/(\*\*.*?\*\*)/g);
            return parts.map((part, index) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                const boldText = part.slice(2, -2);
                return <strong key={index} className="font-bold">{boldText}</strong>;
              }
              return <span key={index}>{part}</span>;
            });
          };
          
          // 표 렌더링
          elements.push(
            <div key={`table-${i}`} className="my-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {headers.map((header, idx) => (
                      <th key={idx} className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100">
                        {formatCellContent(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-800 dark:text-gray-200">
                          {formatCellContent(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          
          i = j;
          continue;
        }
      }
      
      // ## 제목 처리 (heading 안의 ** bold 마크다운은 무시하고 plain text로 렌더링)
      if (line.trim().startsWith('##')) {
        const titleText = line.trim().slice(2).trim().replace(/\*\*(.*?)\*\*/g, '$1');
        elements.push(
          <h2 key={i} className="text-xl font-bold mt-4 mb-2">
            {titleText}
          </h2>
        );
        i++;
        continue;
      }
      // # 제목 처리
      if (line.trim().startsWith('#') && !line.trim().startsWith('##')) {
        const titleText = line.trim().slice(1).trim().replace(/\*\*(.*?)\*\*/g, '$1');
        elements.push(
          <h1 key={i} className="text-2xl font-bold mt-4 mb-2">
            {titleText}
          </h1>
        );
        i++;
        continue;
      }
      
      // **텍스트** bold 처리
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedParts = parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          return <strong key={index} className="font-bold">{boldText}</strong>;
        }
        return <span key={index}>{part}</span>;
      });
      
      elements.push(
        <div key={i}>
          {formattedParts}
          {i < lines.length - 1 && <br />}
        </div>
      );
      
      i++;
    }
    
    return <>{elements}</>;
  }, []);
  
  return wrapWithProfiler(
    'ChatRoot',
    <div className="flex h-[calc(100vh-3.5rem)] bg-white dark:bg-gray-900 overflow-hidden">
      {/* 사이드바 */}
      {wrapWithProfiler(
        'ChatSidebar',
        <div className="w-64 flex-shrink-0 bg-[#f9f9f9] dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col chat-list-card">
        {/* 새 채팅 버튼 */}
        <div className="p-2 space-y-1">
          <button
            onClick={handleNewChat}
            disabled={isOnCooldown}
            className={cn(
              "chat-new-button w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
              isOnCooldown && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="text-sm font-normal">{isOnCooldown ? t.chat.pleaseWait : t.chat.newChat}</span>
            <Plus className="w-4 h-4" />
          </button>
          {/* 검색 + 북마크 + 내보내기 버튼 */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowSearch(v => !v)}
              className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="대화 검색"
            >
              <Search className="w-3.5 h-3.5" />
              검색
            </button>
            <button
              onClick={() => setShowBookmarks(true)}
              className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="저장된 답변"
            >
              <Star className="w-3.5 h-3.5" />
              북마크
            </button>
          </div>
          {showSearch && (
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="대화 검색..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
              autoFocus
            />
          )}
        </div>
        
        {/* 대화 목록 */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {filteredSessions.map(session => (
              <div
                key={session.id}
                className={cn(
                  'group relative rounded-lg transition-colors',
                  session.id === currentSessionId ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <div className="flex items-center justify-between px-3 py-2.5 gap-1">
                  {isRenaming === session.id ? (
                    <>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateChatSessionTitle(session.id, newTitle);
                            setIsRenaming(null);
                          } else if (e.key === 'Escape') {
                            setIsRenaming(null);
                          }
                        }}
                        className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          updateChatSessionTitle(session.id, newTitle);
                          setIsRenaming(null);
                        }}
                        className="p-1 hover:bg-gray-300 rounded transition-all text-green-600"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsRenaming(null)}
                        className="p-1 hover:bg-gray-300 rounded transition-all text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setCurrentSession(session.id)}
                        className="flex-1 text-left text-sm text-gray-800 truncate font-normal"
                      >
                        {session.title}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRenaming(session.id);
                          setNewTitle(session.title);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all text-gray-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (showDeleteConfirmation) {
                            setShowDeleteConfirm(session.id);
                          } else {
                            deleteChatSession(session.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all text-gray-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 메뉴 - 로그인한 경우만 표시 */}
        {currentUser && (
          <div className="border-t border-gray-200 p-2 space-y-1">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-800 font-normal"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{t.chat.dashboard}</span>
            </button>
            <button
              onClick={() => router.push('/settings')}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-800 font-normal"
            >
              <Settings className="w-4 h-4" />
              <span>{t.chat.settings}</span>
            </button>
          </div>
        )}
      </div>
      )}
      
      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 메시지 영역 */}
        {wrapWithProfiler(
          'ChatMessages',
          <div 
            ref={messagesContainerRef}
            className={cn(
              "flex-1 chat-message-card",
              currentMessages.length === 0 ? "overflow-hidden" : "overflow-y-auto"
            )}
            onScroll={(e) => {
              const container = e.currentTarget;
              const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
              const wasScrolledUp = userScrolledUpRef.current;
              userScrolledUpRef.current = !isAtBottom;

              // 스트리밍 중 위로 스크롤했을 때 자동스크롤 끄기 여부 질문
              if (!isAtBottom && !wasScrolledUp && (streamingRef.current || isLoading) && autoScrollToastIdRef.current === null) {
                const toastId = toast('자동 내려가기 기능을 끌까요?', {
                  duration: Infinity,
                  action: {
                    label: '예',
                    onClick: () => {
                      userScrolledUpRef.current = true;
                      autoScrollToastIdRef.current = null;
                    },
                  },
                  cancel: {
                    label: '아니오',
                    onClick: () => {
                      userScrolledUpRef.current = false;
                      autoScrollToastIdRef.current = null;
                      scrollToBottom(true);
                    },
                  },
                  onDismiss: () => {
                    autoScrollToastIdRef.current = null;
                  },
                });
                autoScrollToastIdRef.current = toastId;
              }

              // 맨 아래로 다시 내려오면 자동스크롤 재활성화 & 토스트 닫기
              if (isAtBottom && autoScrollToastIdRef.current !== null) {
                toast.dismiss(autoScrollToastIdRef.current);
                autoScrollToastIdRef.current = null;
              }
            }}
          >
          {currentMessages.length === 0 ? (
            <div className="text-center px-4 flex items-center justify-center h-full">
              <h1 className="text-4xl font-bold text-gray-800">{t.chat.welcome}</h1>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 pt-6">
              {(() => {
                const messages = currentMessages;
                const shouldUseDraftSplit = !!draftMessageId;
                const draftIndex = shouldUseDraftSplit
                  ? messages.findIndex((m: ChatMessage) => m.id === draftMessageId)
                  : -1;
                const hasDraftInMessages = shouldUseDraftSplit && draftIndex >= 0;

                const renderMessage = (msg: ChatMessage, msgIndex: number, overrideContent?: string) => {
                  // _streamingContent Map에서 스트리밍 중인 content 우선 사용
                  const streamKey = currentSessionId ? `${currentSessionId}:${msg.id}` : null;
                  const liveContent = streamKey ? streamingContent?.get(streamKey) : undefined;
                  const resolvedContent = overrideContent ?? liveContent ?? undefined;
                  return (
                  <ChatMessageRow
                    key={msg.id}
                    msg={msg}
                    msgIndex={msgIndex}
                    overrideContent={resolvedContent}
                    modelById={modelById}
                    formatMessage={formatMessage}
                    onDownloadImage={handleDownloadImage}
                    isStreaming={isLoading && msg.role === 'assistant' && !String(resolvedContent ?? msg.content ?? '').trim() && msgIndex === messages.length - 1}
                    isLastAssistant={msg.role === 'assistant' && msg.id === lastAssistantMsgId && !isLoading}
                    isBookmarked={bookmarkedMessageIds.has(msg.id)}
                    onBookmark={msg.role === 'assistant' ? handleBookmark : undefined}
                    onTTS={msg.role === 'assistant' ? handleTTS : undefined}
                    onRegenerate={msg.role === 'assistant' && msg.id === lastAssistantMsgId && !isLoading ? () => handleRegenerate() : undefined}
                    availableModels={availableModels.filter(m => m.id !== msg.modelId)}
                    onRegenerateWithModel={(modelId) => handleRegenerate(modelId)}
                  />
                  );
                };

                if (!hasDraftInMessages) {
                  return <>{messages.map((msg: ChatMessage, msgIndex: number) => renderMessage(msg, msgIndex))}</>;
                }

                const beforeDraft = messages.slice(0, draftIndex);
                const draftMsg = messages[draftIndex];
                const afterDraft = messages.slice(draftIndex + 1);

                const beforeDraftNodes = beforeDraft.map((msg: ChatMessage, idx: number) => renderMessage(msg, idx));
                const afterDraftNodes = afterDraft.map((msg: ChatMessage, idx: number) => renderMessage(msg, draftIndex + 1 + idx));

                return (
                  <>
                    {beforeDraftNodes}
                    {renderMessage(draftMsg, draftIndex, draftContent)}
                    {afterDraftNodes}
                  </>
                );
              })()}
              
              {/* 취소 버튼 - 로딩 중에만 표시 */}
              {isLoading && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={handleCancelStream}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full text-sm text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    응답 중지
                  </button>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        )}
        
        {/* 입력 영역 */}
        {wrapWithProfiler(
          'ChatInput',
          <div className="p-4">
          <div className="max-w-3xl mx-auto">
            {/* 모델 선택 */}
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-500 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                <option value="">{t.chat.selectModel}</option>
                {availableModels.map(model => {
                  const credits = walletCredits?.[model.id] || 0;
                  return (
                    <option key={model.id} value={model.id}>
                      {model.displayName} (잔여 {credits}회)
                    </option>
                  );
                })}
              </select>
            </div>
            {/* 스마트 라우터 */}
            {showSmartRouterPanel && message.trim().length > 0 && availableModels.length > 0 && (
              <div className="mb-3">
                <SmartRouterContent
                  question={message}
                  models={availableModels}
                  speechLevel={speechLevel}
                  language={language}
                  compact
                  autoAnalyzeToken={smartRouterAutoAnalyzeToken}
                />
              </div>
            )}


            {/* 첨부 미리보기 */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 bg-gray-50 border rounded-lg px-2 py-1">
                    {att.type === 'image' ? (
                      <div className="w-8 h-8 rounded overflow-hidden border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <Paperclip className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="text-xs text-gray-700 max-w-[120px] truncate">{att.name}</span>
                    <button onClick={() => removeAttachment(att.id)} className="p-0.5 hover:bg-gray-200 rounded">
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={isImageAttachDisabled ? "text/plain,application/json" : "image/*,text/plain,application/json"}
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = ''; // 같은 파일 재선택 허용
              }}
            />

            {/* 이미지 첨부 불가 안내 */}
            {isImageAttachDisabled && (
              <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>이 모델은 이미지 첨부를 지원하지 않습니다.</span>
              </div>
            )}

            {/* 48h 배치 대기 중 잠금 배너 */}
            {batchPendingMessageId && (
              <div className="mb-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>답변 준비 중입니다. 최대 48시간 내에 답변이 도착하면 자동으로 표시됩니다.</span>
              </div>
            )}

            {/* 메인 입력창 */}
            <div className="relative bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-3xl shadow-sm hover:shadow-md transition-shadow chat-input-card">
              <div className="flex items-end p-3 gap-2">
                {/* Plus 버튼 */}
                <div className="relative" ref={plusMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Plus className="w-5 h-5 text-gray-600" />
                  </button>

                  {/* Plus 메뉴 */}
                  {showPlusMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)}></div>
                      <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                        <div className="p-2">
                          {/* 템플릿 */}
                          <button
                            onClick={() => {
                              setShowTemplates(true);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <MessageSquare className="w-5 h-5 text-blue-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">대화 템플릿</div>
                              <div className="text-xs text-gray-500">저장된 프롬프트 사용</div>
                            </div>
                          </button>

                          {/* 실시간 동시 비교 */}
                          <button
                            onClick={() => {
                              setShowComparison(true);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                              <GitCompare className="w-5 h-5 text-purple-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">동시 비교</div>
                              <div className="text-xs text-gray-500">여러 AI에 동시 질문</div>
                            </div>
                          </button>

                          {/* AI 체인 */}
                          <button
                            onClick={() => {
                              setShowChainMode(true);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                              <Link2 className="w-5 h-5 text-orange-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">AI 체인</div>
                              <div className="text-xs text-gray-500">여러 AI가 순서대로 협업</div>
                            </div>
                          </button>

                          {/* AI 토론 */}
                          <button
                            onClick={() => {
                              setShowDebateMode(true);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                              <Swords className="w-5 h-5 text-red-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">AI 토론</div>
                              <div className="text-xs text-gray-500">두 AI가 주제로 끝장 토론</div>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              if (!message.trim()) {
                                toast.info('질문을 먼저 입력해주세요.');
                                setShowPlusMenu(false);
                                return;
                              }
                              setShowSmartRouterPanel(true);
                              setSmartRouterAutoAnalyzeToken((prev) => prev + 1);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <Sparkles className="w-5 h-5 text-indigo-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">질문 분석하기</div>
                              <div className="text-xs text-gray-500">입력한 질문에 맞는 AI 추천</div>
                            </div>
                          </button>

                          {/* 내보내기 */}
                          <div className="px-4 py-2 border-t border-gray-100 mt-1">
                            <div className="text-xs text-gray-500 mb-1.5">대화 내보내기</div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { handleExportChat('markdown'); setShowPlusMenu(false); }}
                                className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Markdown
                              </button>
                              <button
                                onClick={() => { handleExportChat('txt'); setShowPlusMenu(false); }}
                                className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                TXT
                              </button>
                            </div>
                          </div>

                          {/* 페르소나 */}
                          <button
                            onClick={() => {
                              setShowPersona(true);
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                              <UserCircle className="w-5 h-5 text-green-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">페르소나 설정</div>
                              <div className="text-xs text-gray-500">AI 성격 및 말투 조절</div>
                            </div>
                          </button>

                          {/* 파일 추가 */}
                          <button
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowPlusMenu(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                          >
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <Paperclip className="w-5 h-5 text-gray-700" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">사진 및 파일 추가</div>
                              <div className="text-xs text-gray-500">이미지, 텍스트 파일 업로드</div>
                            </div>
                          </button>

                          {/* Temperature 조절 */}
                          <div className="px-4 py-3 border-t border-gray-100 mt-2">
                            <div className="mb-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold text-gray-900">응답 스타일</span>
                                <span className="text-sm text-gray-600">{temperature.toFixed(1)}</span>
                              </div>
                              {(selectedModelId === 'gpt5' || selectedModelId === 'gpt51' || selectedModelId === 'gpt52') && (
                                <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mt-1">
                                  ⚠️ GPT-5 시리즈 모델은 응답 스타일 조절을 지원하지 않습니다
                                </div>
                              )}
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1.9"
                              step="0.1"
                              value={temperature}
                              onChange={(e) => setTemperature(parseFloat(e.target.value))}
                              disabled={selectedModelId === 'gpt5' || selectedModelId === 'gpt51' || selectedModelId === 'gpt52'}
                              className={cn(
                                "w-full h-1 bg-gray-200 rounded-lg appearance-none",
                                (selectedModelId === 'gpt5' || selectedModelId === 'gpt51' || selectedModelId === 'gpt52')
                                  ? "cursor-not-allowed opacity-50" 
                                  : "cursor-pointer"
                              )}
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>정확</span>
                              <span>창의</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 영상 모델: 초 입력 칸 */}
                {isVideoModel && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={videoMaxSeconds}
                      value={videoSeconds}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(videoMaxSeconds, Number(e.target.value)));
                        setVideoSeconds(v);
                      }}
                      className="w-12 text-center px-1 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={isLoading || streamingRef.current}
                    />
                    <span className="text-[10px] text-gray-400 leading-none">초</span>
                  </div>
                )}

                {/* 텍스트 입력 */}
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={streamingRef.current ? "AI가 답변 중입니다..." : isVideoModel ? `영상 프롬프트를 입력하세요 (최대 ${videoMaxSeconds}초)` : t.chat.askAnything}
                  className={cn(
                    "flex-1 px-2 py-2 bg-transparent focus:outline-none resize-none",
                    streamingRef.current || isLoading
                      ? "text-gray-400 placeholder-gray-300 cursor-not-allowed"
                      : "text-gray-900 placeholder-gray-400 dark:text-white dark:placeholder-gray-500"
                  )}
                  rows={1}
                  style={{ minHeight: '24px', maxHeight: '200px', overflowY: 'hidden' }}
                  maxLength={selectedModelMaxCharacters}
                  disabled={isLoading || streamingRef.current}
                />

                {/* 전송 버튼 */}
                <button
                  onClick={() => {
                    // 커스텀 소리 재생 (디자인하기에서 설정한 경우만)
                    if (sendButtonSound && message.trim() && !isLoading && !streamingRef.current) {
                      try {
                        const audio = new Audio(sendButtonSound);
                        audio.play().catch(() => {});
                      } catch {}
                    }
                    handleSendMessage();
                  }}
                  disabled={!message.trim() || isLoading || streamingRef.current || !selectedModelId || !!batchPendingMessageId}
                  className={cn(
                    "chat-send-button p-2 rounded-full transition-all",
                    !message.trim() || isLoading || streamingRef.current || !selectedModelId || !!batchPendingMessageId
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                  title={streamingRef.current ? "AI가 답변 중입니다" : ""}
                >
                  {isLoading || streamingRef.current ? (
                    <div className="w-5 h-5 border-2 border-t-gray-400 border-r-gray-400 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                  ) : sendButtonSymbol ? (
                    <span className="w-5 h-5 flex items-center justify-center text-base leading-none">{sendButtonSymbol}</span>
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* 글자 수 표시 */}
            {selectedModelId && (
              <div className="mt-2 text-xs text-gray-500 text-right">
                {message.length} / {selectedModelMaxCharacters}{t.chat.characterCount}
              </div>
            )}

            {availableModels.length === 0 && (
              <div className="mt-3 p-3 bg-yellow-50 rounded-lg flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-yellow-800">
                    {t.chat.noCredits}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteConfirm(null);
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">{t.chat.deleteTitle}</h3>
            <p className="mb-6 dark:text-gray-300">{t.chat.deleteConfirm}</p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(null);
                }}
              >
                {t.cancel}
              </Button>
              <Button
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChatSession(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
              >
                {t.delete}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 모달 */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTemplates(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{t.chat.templates}</h2>
              <button onClick={() => setShowTemplates(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <ChatTemplatesContent />
            </div>
          </div>
        </div>
      )}

      {/* 모델 비교 모달 */}
      {showComparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowComparison(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{t.chat.modelComparison}</h2>
              <button onClick={() => setShowComparison(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <ModelComparisonContent availableModels={availableModels} walletCredits={walletCredits || {}} modelById={modelById} onClose={() => setShowComparison(false)} language={language} speechLevel={speechLevel} />
            </div>
          </div>
        </div>
      )}

      {/* 페르소나 모달 */}
      {showPersona && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPersona(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">{t.chat.persona}</h2>
              <button onClick={() => setShowPersona(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <PersonaSettingsContent />
            </div>
          </div>
        </div>
      )}

      {/* 북마크 모달 */}
      {showBookmarks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBookmarks(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                저장된 답변
              </h2>
              <button onClick={() => setShowBookmarks(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4 space-y-3">
              {bookmarkedMessages.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Star className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>저장된 답변이 없습니다.</p>
                  <p className="text-sm mt-1">AI 답변 아래 북마크 버튼을 클릭하면 여기에 저장됩니다.</p>
                </div>
              ) : bookmarkedMessages.map(bm => (
                <div key={bm.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 group">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="text-xs text-gray-500">
                      {bm.sessionTitle && <span className="font-medium text-gray-700 dark:text-gray-300">{bm.sessionTitle} · </span>}
                      {modelById.get(bm.modelId || '')?.displayName || 'AI'} · {new Date(bm.timestamp).toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => removeBookmark(bm.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                      title="북마크 해제"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  <div className="text-sm text-gray-800 dark:text-gray-200 line-clamp-5 whitespace-pre-wrap">
                    {stripSummaryBlock(bm.content).slice(0, 500)}{bm.content.length > 500 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI 체인 모달 */}
      {showChainMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowChainMode(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Link2 className="w-5 h-5 text-orange-500" />
                AI 체인 — 여러 AI가 순서대로 협업
              </h2>
              <button onClick={() => setShowChainMode(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              <AiChainContent availableModels={availableModels} walletCredits={walletCredits || {}} modelById={modelById} onClose={() => setShowChainMode(false)} language={language} speechLevel={speechLevel} />
            </div>
          </div>
        </div>
      )}

      {/* AI 토론 모달 */}
      {showDebateMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDebateMode(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Swords className="w-5 h-5 text-red-500" />
                AI 토론 — 두 AI가 끝장 토론
              </h2>
              <button onClick={() => setShowDebateMode(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              <AiDebateContent availableModels={availableModels} walletCredits={walletCredits || {}} modelById={modelById} onClose={() => setShowDebateMode(false)} language={language} speechLevel={speechLevel} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 템플릿 컴포넌트 임포트를 위한 래퍼
const ChatTemplatesContent = dynamic(() => import('@/components/ChatTemplates').then(mod => ({ default: mod.ChatTemplates })), { ssr: false });
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – SideBySide is a dynamic component without static type declarations
const ModelComparisonContent = dynamic(() => import('@/components/SideBySide').then((mod: any) => ({ default: mod.SideBySide })), { ssr: false }) as React.ComponentType<AiFeatureProps>;
const PersonaSettingsContent = dynamic(() => import('@/components/PersonaSettings').then(mod => ({ default: mod.PersonaSettings })), { ssr: false });
type AiFeatureProps = { availableModels: any[]; walletCredits: { [modelId: string]: number }; modelById: Map<string, any>; onClose?: () => void; language?: string; speechLevel?: string; };
type SmartRouterProps = { question: string; models: any[]; speechLevel?: string; language?: string; compact?: boolean; autoAnalyzeToken?: number; };
// @ts-ignore – AiChain is a dynamic component without static type declarations
const AiChainContent = dynamic(() => import('@/components/AiChain').then((mod: any) => ({ default: mod.AiChain })), { ssr: false }) as React.ComponentType<AiFeatureProps>;
// @ts-ignore – AiDebate is a dynamic component without static type declarations
const AiDebateContent = dynamic(() => import('@/components/AiDebate').then((mod: any) => ({ default: mod.AiDebate })), { ssr: false }) as React.ComponentType<AiFeatureProps>;
const SmartRouterContent = dynamic(() => import('@/components/SmartRouter').then(mod => ({ default: mod.SmartRouter })), { ssr: false }) as React.ComponentType<SmartRouterProps>;
