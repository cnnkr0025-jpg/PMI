import { Shield, Lock, Trash2, EyeOff, Server, CheckCircle, AlertCircle, Eye, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: '보안 대시보드 | Pick-My-AI',
  description: 'Pick-My-AI의 보안 정책, 암호화 상태, 데이터 삭제 정책 및 투명성 보고서를 확인하세요.',
};

const securityItems = [
  {
    icon: Lock,
    title: '전송 및 저장 암호화',
    status: '적용 중',
    statusColor: 'text-green-600 bg-green-50',
    description: '모든 데이터는 HTTPS(TLS 1.2+)를 통해 전송 중 암호화되며, 저장 시에도 암호화된 상태로 관리됩니다.',
    detail: 'HTTPS / TLS 1.2+, Supabase 스토리지 암호화',
  },
  {
    icon: Trash2,
    title: '자동 삭제 시스템',
    status: '적용 중',
    statusColor: 'text-green-600 bg-green-50',
    description: '대화 데이터는 설정에 따라 자동으로 삭제됩니다. 즉시 삭제 버튼도 제공합니다.',
    detail: '설정 → 자동 삭제에서 직접 관리 가능',
  },
  {
    icon: EyeOff,
    title: '외부 공유·판매 없음',
    status: '확인됨',
    statusColor: 'text-green-600 bg-green-50',
    description: '사용자 데이터는 광고·마케팅 목적으로 제3자에게 판매하거나 공유하지 않습니다.',
    detail: '외부 판매 0건 / 무단 공유 0건',
  },
  {
    icon: Server,
    title: '안전한 인프라',
    status: '정상 운영',
    statusColor: 'text-green-600 bg-green-50',
    description: 'Supabase 기반 인증 및 데이터 관리로 엔터프라이즈급 보안을 제공합니다.',
    detail: 'Supabase Auth + Row Level Security',
  },
  {
    icon: Shield,
    title: '보안 업데이트',
    status: '최신',
    statusColor: 'text-blue-600 bg-blue-50',
    description: '보안 패치 및 의존성 업데이트를 정기적으로 적용하여 최신 보안 상태를 유지합니다.',
    detail: '정기 패치 적용 중',
  },
  {
    icon: Eye,
    title: '로그 저장 정책',
    status: '최소 수집',
    statusColor: 'text-amber-600 bg-amber-50',
    description: '서비스 개선 및 오류 분석에 필요한 최소한의 접속 로그만 수집합니다. 대화 내용은 분석에 사용되지 않습니다.',
    detail: '서비스 오류 로그 / 대화 내용 분석 없음',
  },
];

const stats = [
  { label: '데이터 유출', value: '0건', sub: '서비스 시작 이후', color: 'text-green-600' },
  { label: '외부 무단 공유', value: '0건', sub: '판매·공유 내역 없음', color: 'text-green-600' },
  { label: '삭제 요청 처리율', value: '100%', sub: '요청 즉시 처리', color: 'text-blue-600' },
  { label: '보안 업데이트', value: '정기', sub: '최신 상태 유지', color: 'text-blue-600' },
];

const faqItems = [
  {
    q: '대화 내용이 AI 학습에 사용되나요?',
    a: 'Pick-My-AI는 사용자의 대화 내용을 AI 모델 학습에 사용하지 않습니다. 대화는 서비스 제공 목적으로만 처리됩니다.',
  },
  {
    q: '데이터 삭제는 어떻게 요청하나요?',
    a: '설정 → 자동 삭제에서 즉시 삭제하거나, 피드백 메뉴를 통해 데이터 삭제를 요청하실 수 있습니다. 요청 즉시 처리됩니다.',
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

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">홈으로</span>
          </Link>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            <span className="font-bold text-gray-900 text-sm">보안 대시보드</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-full">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700">모든 보안 항목 정상</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900">보안 대시보드</h1>
          <p className="text-lg text-gray-500 max-w-2xl">
            Pick-My-AI가 사용자 데이터를 어떻게 보호하는지 구조로 보여드립니다.
            약속이 아닌 시스템으로 신뢰를 증명합니다.
          </p>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-black text-gray-900">보안 항목 현황</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {securityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50">
                        <Icon className="w-5 h-5 text-gray-700" />
                      </div>
                      <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full ${item.statusColor}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {item.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black text-gray-900">투명성 보고서</h2>
          <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center space-y-2 p-6 bg-gray-50 rounded-xl">
                  <p className={`text-4xl font-black ${stat.color}`}>{stat.value}</p>
                  <p className="text-sm font-semibold text-gray-700">{stat.label}</p>
                  <p className="text-xs text-gray-400">{stat.sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                본 수치는 서비스 운영 현황을 기반으로 작성되었으며, 서비스 시작 이후 누적 데이터를 기준으로 합니다.
                데이터 삭제 요청은 설정 또는 피드백 메뉴를 통해 언제든지 신청하실 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-black text-gray-900">보안 FAQ</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <div key={item.q} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-2">
                <h3 className="text-sm font-bold text-gray-900 flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold mt-0.5">Q</span>
                  {item.q}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed pl-7">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-gray-900">개인정보 관련 문의</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            개인정보 처리, 데이터 삭제, 또는 보안 관련 문의가 있으시면 서비스 내 피드백 기능을 통해 접수해 주세요.
            확인 즉시 처리해 드립니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              개인정보처리방침 보기
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              로그인 후 문의하기
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
