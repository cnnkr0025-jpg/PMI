'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Send, Clock } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/store';
import { toast } from 'sonner';

const faqCategories = [
  {
    category: '결제 & 크레딧',
    items: [
      {
        q: '결제가 안 되는데 어떻게 하나요?',
        a: '결제 오류는 대부분 카드사 정책 또는 브라우저 팝업 차단이 원인입니다. 다른 브라우저로 시도하거나, 카드사 고객센터에 해외 결제 차단 여부를 확인해 보세요. 문제가 지속되면 아래 문의 채널로 접수해 주세요.',
      },
      {
        q: '크레딧이 충전됐는데 반영이 안 돼요.',
        a: '결제 완료 후 최대 1~2분 내에 자동 반영됩니다. 5분 이상 지나도 반영되지 않는다면, 결제 확인 이메일과 함께 문의해 주시면 즉시 처리해 드립니다.',
      },
      {
        q: '환불은 어떻게 신청하나요?',
        a: '미사용 크레딧에 대해 결제일로부터 7일 이내 환불을 신청하실 수 있습니다. 이용 약관 기준에 따라 처리됩니다. 문의 채널로 접수해 주세요.',
      },
    ],
  },
  {
    category: '로그인 & 계정',
    items: [
      {
        q: '로그인이 안 돼요.',
        a: '구글 소셜 로그인의 경우 브라우저 쿠키/팝업이 허용되어 있는지 확인해 주세요. 이메일 로그인은 가입 시 입력한 이메일 주소를 정확히 입력했는지 확인하고, 비밀번호 재설정을 시도해 보세요.',
      },
      {
        q: '계정을 삭제하고 싶어요.',
        a: '계정 삭제는 설정 페이지에서 직접 탈퇴 신청을 하거나, 아래 문의 채널로 "계정 삭제 요청"을 보내주시면 24시간 이내 처리해 드립니다.',
      },
      {
        q: '비밀번호를 잊어버렸어요.',
        a: '로그인 페이지에서 "비밀번호 재설정"을 클릭하시면 가입 이메일로 재설정 링크를 보내드립니다.',
      },
    ],
  },
  {
    category: 'AI 이용',
    items: [
      {
        q: 'AI가 응답을 안 해요 / 오류가 나요.',
        a: '일시적인 AI 서버 과부하일 수 있습니다. 잠시 후 다시 시도해 주세요. 지속적으로 문제가 발생한다면, 어떤 모델에서 어떤 오류가 발생하는지 함께 알려주시면 빠르게 확인해 드립니다.',
      },
      {
        q: '무료 체험 크레딧은 어떻게 사용하나요?',
        a: '가입 즉시 무료 체험 크레딧이 자동 지급됩니다. 별도 설정 없이 AI 모델 구매 화면에서 모델을 선택하면 바로 사용 가능합니다.',
      },
      {
        q: '어떤 AI 모델을 선택해야 하나요?',
        a: '용도에 따라 다릅니다. 빠른 답변이 필요하면 GPT-4o mini, 깊이 있는 분석은 Claude Sonnet, 자료 조사는 Perplexity를 추천합니다. 가이드 페이지에서 더 자세한 비교를 확인해 보세요.',
      },
    ],
  },
];

const slaInfo = [
  { period: '평일 (9:00~18:00)', time: '30분~1시간' },
  { period: '평일 (18:00~익일)', time: '1~3시간' },
  { period: '주말 / 공휴일', time: '3~8시간' },
];

function getInquiryLoad() {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  if (day === 0 || day === 6) return '낮음';
  if (hour >= 9 && hour < 13) return '보통';
  if (hour >= 13 && hour < 18) return '낮음';
  return '낮음';
}

export default function ContactPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [type, setType] = useState<'question' | 'suggestion' | 'bug'>('question');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const submitFeedback = useStore((s) => s.submitFeedback);
  const inquiryLoad = getInquiryLoad();

  const categories = ['전체', ...faqCategories.map((c) => c.category)];
  const filteredFaq =
    selectedCategory === '전체'
      ? faqCategories
      : faqCategories.filter((c) => c.category === selectedCategory);

  const toggle = (key: string) => setOpenIndex((prev) => (prev === key ? null : key));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setIsSending(true);
    try {
      const ok = await submitFeedback({ type, title, content, screenshots: [] });
      if (!ok) {
        toast.error('문의 전송에 실패했습니다.');
        return;
      }
      setSent(true);
      setTitle('');
      setContent('');
      toast.success('문의가 접수되었습니다. 빠르게 답변드리겠습니다.');
    } finally {
      setIsSending(false);
    }
  }, [type, title, content, submitFeedback]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 sticky top-0 z-10 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            홈
          </Link>
          <span className="text-gray-200">/</span>
          <span className="text-sm text-gray-700">문의</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        {/* 헤더 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">문의 & FAQ</h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${
              inquiryLoad === '낮음' ? 'bg-green-400' : 'bg-yellow-400'
            } animate-pulse`} />
            현재 문의량: {inquiryLoad}
          </div>
        </div>

        {/* 응답 시간 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            응답 시간
          </h2>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {slaInfo.map((item) => (
              <div key={item.period} className="flex items-center justify-between px-4 py-3 bg-white">
                <span className="text-sm text-gray-600">{item.period}</span>
                <span className="text-sm text-gray-800">{item.time}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 px-1">문의 접수 즉시 자동 확인 메시지가 발송됩니다.</p>
        </section>

        {/* 자주 묻는 질문 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">자주 묻는 질문</h2>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  selectedCategory === cat
                    ? 'bg-gray-900 text-white'
                    : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {filteredFaq.map((cat) =>
              cat.items.map((item, idx) => {
                const key = `${cat.category}-${idx}`;
                const isOpen = openIndex === key;
                return (
                  <div key={key} className="bg-white">
                    <button
                      onClick={() => toggle(key)}
                      className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800">{item.q}</span>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 직접 문의 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">직접 문의</h2>

          {isAuthenticated ? (
            sent ? (
              <div className="border border-gray-100 rounded-xl p-6 text-center space-y-2">
                <p className="text-sm text-gray-800">문의가 접수되었습니다.</p>
                <p className="text-xs text-gray-400">응답 시간 내에 답변드리겠습니다.</p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-3 text-xs text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
                >
                  새 문의 작성
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="divide-y divide-gray-100">
                  <div className="px-4 py-3">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as typeof type)}
                      className="w-full text-sm text-gray-700 bg-transparent outline-none"
                    >
                      <option value="question">문의 / 질문</option>
                      <option value="suggestion">건의 / 개선 제안</option>
                      <option value="bug">오류 / 버그 신고</option>
                    </select>
                  </div>
                  <div className="px-4 py-3">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="제목"
                      required
                      className="w-full text-sm text-gray-800 placeholder-gray-400 bg-transparent outline-none"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="문의 내용을 입력하세요."
                      required
                      rows={4}
                      maxLength={900}
                      className="w-full text-sm text-gray-800 placeholder-gray-400 bg-transparent outline-none resize-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{content.length} / 900</span>
                  <button
                    type="submit"
                    disabled={isSending || !title.trim() || !content.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSending ? '전송 중...' : '문의 보내기'}
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="border border-gray-100 rounded-xl p-6 space-y-3">
              <p className="text-sm text-gray-600">로그인 후 직접 문의를 보낼 수 있습니다.</p>
              <Link
                href="/login"
                className="inline-block px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                로그인하기
              </Link>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-100 py-6 px-6 text-center">
        <p className="text-xs text-gray-400">© 2025 Pick-My-AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
