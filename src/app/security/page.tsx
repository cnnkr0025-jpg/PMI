import { Shield, Lock, Trash2, EyeOff, Server, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: '보안 | Pick-My-AI',
  description: 'Pick-My-AI의 보안 정책, 암호화 상태, 데이터 삭제 정책을 확인하세요.',
};

const securityItems = [
  {
    icon: Lock,
    title: '전송 및 저장 암호화',
    status: '적용 중',
    description: '모든 데이터는 HTTPS(TLS 1.2+)를 통해 전송 중 암호화되며, 저장 시에도 암호화된 상태로 관리됩니다.',
    detail: 'HTTPS / TLS 1.2+, Supabase 스토리지 암호화',
  },
  {
    icon: Trash2,
    title: '자동 삭제 시스템',
    status: '적용 중',
    description: '대화 데이터는 설정에 따라 자동으로 삭제됩니다. 설정 페이지에서 주기를 직접 지정할 수 있습니다.',
    detail: '설정 → 자동 삭제에서 직접 관리 가능',
  },
  {
    icon: EyeOff,
    title: '외부 공유·판매 없음',
    status: '확인됨',
    description: '사용자 데이터는 광고·마케팅 목적으로 제3자에게 판매하거나 공유하지 않습니다.',
    detail: '외부 판매 0건 / 무단 공유 0건',
  },
  {
    icon: Server,
    title: '안전한 인프라',
    status: '정상 운영',
    description: 'Supabase 기반 인증 및 데이터 관리로 엔터프라이즈급 보안을 제공합니다.',
    detail: 'Supabase Auth + Row Level Security',
  },
  {
    icon: Shield,
    title: '보안 업데이트',
    status: '최신',
    description: '보안 패치 및 의존성 업데이트를 정기적으로 적용하여 최신 보안 상태를 유지합니다.',
    detail: '정기 패치 적용 중',
  },
];

const faqItems = [
  {
    q: '대화 내용이 AI 학습에 사용되나요?',
    a: 'Pick-My-AI는 사용자의 대화 내용을 AI 모델 학습에 사용하지 않습니다. 대화는 서비스 제공 목적으로만 처리됩니다.',
  },
  {
    q: '데이터 삭제는 어떻게 하나요?',
    a: '로그인 후 설정 → 자동 삭제에서 즉시 삭제하거나 자동 삭제 주기를 설정할 수 있습니다. 요청 즉시 처리됩니다.',
  },
  {
    q: '결제 정보는 안전하게 보관되나요?',
    a: '결제 정보는 포트원(PG사)을 통해 처리되며, Pick-My-AI 서버에는 카드 번호 등 민감한 결제 정보가 저장되지 않습니다.',
  },
  {
    q: '계정 탈퇴 시 데이터는 어떻게 되나요?',
    a: '회원 탈퇴 시 개인 식별 데이터는 즉시 삭제됩니다. 관련 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 후 삭제됩니다.',
  },
];

const controlItems = [
  {
    icon: Trash2,
    title: '대화 내역 즉시 삭제',
    desc: '모든 대화 내역을 지금 바로 영구 삭제합니다.',
    href: '/settings',
    label: '설정에서 삭제',
  },
  {
    icon: CheckCircle,
    title: '자동 삭제 주기 설정',
    desc: '7일 / 30일 / 90일 중 원하는 주기를 선택해 자동으로 삭제합니다.',
    href: '/settings',
    label: '주기 설정',
  },
  {
    icon: EyeOff,
    title: '계정 및 데이터 완전 삭제',
    desc: '탈퇴 시 개인 식별 데이터가 즉시 삭제됩니다.',
    href: '/settings',
    label: '설정에서 탈퇴',
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 sticky top-0 z-10 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            홈
          </Link>
          <span className="text-gray-200">/</span>
          <span className="text-sm text-gray-700">보안</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        {/* 헤더 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Security</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">보안 및 개인정보 보호</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Pick-My-AI가 사용자 데이터를 어떻게 보호하는지 확인하세요.
          </p>
        </div>

        {/* 핵심 수치 */}
        <section className="grid grid-cols-3 gap-4 border-y border-gray-100 py-8">
          {[
            { value: '0건', label: '데이터 유출' },
            { value: '0건', label: '외부 무단 공유' },
            { value: '100%', label: '삭제 요청 처리율' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </section>

        {/* 보안 항목 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">보안 항목</h2>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {securityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center justify-between gap-4 px-4 py-3.5 bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{item.detail}</p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 px-1">
            위 항목 외에도 Rate Limiting, CSRF 방어, JWT 인증, IP 블랙리스트, 버스트 탐지, 허니팟 트래핑 등 <span className="text-gray-600">100개 이상의 보안 규칙</span>이 적용되어 있습니다.
          </p>
        </section>

        {/* 내 데이터 제어 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">데이터 제어</h2>
            <p className="text-xs text-gray-400 mt-1">로그인 후 설정 페이지에서 직접 제어할 수 있습니다.</p>
          </div>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {controlItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center justify-between gap-4 px-4 py-4 bg-white">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                  <Link
                    href={item.href}
                    className="flex-shrink-0 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 px-1">
            로그인하지 않은 경우 설정 페이지에서 로그인 후 이용할 수 있습니다.
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">자주 묻는 질문</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <div key={item.q} className="border border-gray-100 rounded-xl p-4 space-y-1.5">
                <p className="text-sm text-gray-800">{item.q}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 하단 링크 */}
        <section className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-800 transition-colors underline-offset-4 hover:underline">
            개인정보처리방침
          </Link>
          <Link href="/contact" className="text-sm text-gray-500 hover:text-gray-800 transition-colors underline-offset-4 hover:underline">
            문의하기
          </Link>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-800 transition-colors underline-offset-4 hover:underline">
            설정 페이지
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-6 px-6 text-center">
        <p className="text-xs text-gray-400">© 2025 Pick-My-AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
