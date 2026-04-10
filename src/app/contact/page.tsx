'use client';

import { useState } from 'react';
import { MessageSquare, ArrowLeft, Clock, CheckCircle, ChevronDown, ChevronUp, AlertCircle, Zap } from 'lucide-react';
import Link from 'next/link';

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
  { period: '평일 (9:00~18:00)', time: '30분~1시간', level: 'high' },
  { period: '평일 (18:00~익일)', time: '1~3시간', level: 'medium' },
  { period: '주말 / 공휴일', time: '3~8시간', level: 'low' },
];

export default function ContactPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');

  const categories = ['전체', ...faqCategories.map((c) => c.category)];
  const filteredFaq =
    selectedCategory === '전체'
      ? faqCategories
      : faqCategories.filter((c) => c.category === selectedCategory);

  const toggle = (key: string) => {
    setOpenIndex((prev) => (prev === key ? null : key));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">홈으로</span>
          </Link>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-gray-900 text-sm">문의 & FAQ</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-14">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">빠른 응답 보장</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900">문의 & FAQ</h1>
          <p className="text-lg text-gray-500">
            자주 묻는 질문을 먼저 확인해 보세요. 대부분의 문제는 바로 해결됩니다.
          </p>
        </div>

        <section className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-black text-gray-900">응답 시간 안내</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {slaInfo.map((item) => (
              <div
                key={item.period}
                className={`rounded-xl p-4 text-center space-y-1 ${
                  item.level === 'high'
                    ? 'bg-green-50 border border-green-100'
                    : item.level === 'medium'
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-gray-50 border border-gray-100'
                }`}
              >
                <p className="text-xs font-semibold text-gray-500">{item.period}</p>
                <p
                  className={`text-xl font-black ${
                    item.level === 'high'
                      ? 'text-green-600'
                      : item.level === 'medium'
                      ? 'text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  {item.time}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              문의 접수 즉시 자동 확인 메시지가 발송되며, 위 기준보다 빠르게 답변드리기 위해 노력합니다.
              현재 문의량이 많을 경우 다소 늦어질 수 있습니다.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black text-gray-900">자주 묻는 질문</h2>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  selectedCategory === cat
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredFaq.map((cat) =>
              cat.items.map((item, idx) => {
                const key = `${cat.category}-${idx}`;
                const isOpen = openIndex === key;
                return (
                  <div
                    key={key}
                    className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => toggle(key)}
                      className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold mt-0.5">
                          Q
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{item.q}</span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-0">
                        <div className="flex items-start gap-3 pl-8">
                          <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white space-y-5">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5" />
            <h2 className="text-xl font-black">직접 문의하기</h2>
          </div>
          <p className="text-blue-100 text-sm leading-relaxed">
            FAQ에서 해결되지 않으셨나요? 로그인 후 피드백 메뉴를 통해 문의 주시면 빠르게 답변드립니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-600 text-sm font-bold rounded-xl hover:bg-blue-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              로그인 후 문의하기
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/40 text-white text-sm font-semibold rounded-xl hover:bg-white/10 transition-colors"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8 px-6 text-center">
        <p className="text-xs text-gray-400">© 2025 Pick-My-AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
