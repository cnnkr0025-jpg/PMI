'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Inbox, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/store';
import type { AdminMessage } from '@/types';

export default function MessagesPage() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const router = useRouter();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [selected, setSelected] = useState<AdminMessage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchMessages();
  }, [isAuthenticated, fetchMessages]);

  const handleOpen = async (msg: AdminMessage) => {
    setSelected(msg);
    if (!msg.is_read) {
      try {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ messageId: msg.id }),
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
        );
      } catch {
        // 무시
      }
    }
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-100 sticky top-0 z-10 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/chat" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">채팅으로</span>
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <span className="text-sm font-medium text-gray-900">
            메시지함
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {selected ? (
          <div className="space-y-6">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              목록으로
            </button>
            <div className="space-y-3 border-b border-gray-100 pb-6">
              <p className="text-xs text-gray-400">
                {new Date(selected.created_at).toLocaleString('ko-KR')}
              </p>
              <h1 className="text-xl font-bold text-gray-900">{selected.title}</h1>
              <p className="text-xs text-gray-400">Pick-My-AI 관리팀</p>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {selected.content}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-gray-900">메시지함</h1>
              <p className="text-sm text-gray-500">관리자가 보낸 공지 및 답변을 확인하세요.</p>
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : messages.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                <Inbox className="w-8 h-8" />
                <p className="text-sm">받은 메시지가 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleOpen(msg)}
                    className="w-full py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors px-1"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {!msg.is_read ? (
                        <span className="block w-2 h-2 rounded-full bg-gray-900" />
                      ) : (
                        <span className="block w-2 h-2 rounded-full bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`text-sm truncate ${!msg.is_read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                        {msg.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {msg.content.slice(0, 60)}{msg.content.length > 60 ? '...' : ''}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
