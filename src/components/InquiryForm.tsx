'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, X, Send, Loader } from 'lucide-react';
import { toast } from 'sonner';

type InquiryType = 'credit' | 'pmc' | 'model' | 'other';

const TYPE_LABELS: Record<InquiryType, string> = {
  credit: '크레딧 관련',
  pmc: 'PMC 관련',
  model: '모델 관련',
  other: '기타',
};

export function InquiryForm() {
  const [type, setType] = useState<InquiryType>('other');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (screenshots.length + files.length > 3) {
      toast.error('스크린샷은 최대 3장까지 첨부할 수 있습니다.');
      return;
    }
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 1_500_000) {
        toast.error(`${file.name}이 너무 큽니다. (최대 1.5MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) setScreenshots((prev) => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeScreenshot = (idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('제목과 내용을 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title: title.trim(), content: content.trim(), screenshots }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || '전송에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      setSubmitted(true);
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="border border-gray-200 rounded-xl p-8 text-center space-y-2">
        <p className="text-sm font-semibold text-gray-900">문의가 접수되었습니다.</p>
        <p className="text-xs text-gray-500">답변은 메시지함에서 확인하실 수 있습니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-xl p-6 space-y-5">
      {/* 문의 유형 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">문의 유형</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as InquiryType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${
                type === t
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 제목 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="문의 제목을 입력하세요"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors"
        />
      </div>

      {/* 내용 */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">내용</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={3000}
          rows={5}
          placeholder="문의 내용을 상세히 입력해주세요"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors resize-none"
        />
        <p className="text-xs text-gray-400 text-right">{content.length}/3000</p>
      </div>

      {/* 스크린샷 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
          스크린샷 첨부 <span className="font-normal normal-case text-gray-400">(최대 3장, 각 1.5MB 이하)</span>
        </label>
        <div className="flex flex-wrap gap-3 items-start">
          {screenshots.map((src, i) => (
            <div key={i} className="relative w-20 h-20 border border-gray-200 rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`screenshot-${i}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeScreenshot(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {screenshots.length < 3 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-20 h-20 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-500 hover:text-gray-600 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              <span className="text-[10px]">추가</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* 제출 */}
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {loading ? '전송 중...' : '문의 전송'}
      </button>
    </form>
  );
}
