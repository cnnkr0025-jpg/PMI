import { Shield, Lock, EyeOff, Server, KeyRound, ShieldAlert, Timer, Database, ArrowLeft, Users, Code2, FileKey, HardDrive, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { InquiryForm } from '@/components/InquiryForm';

export const metadata = {
  title: '보안 | Pick-My-AI',
  description: 'Pick-My-AI가 적용하고 있는 보안 기술과 데이터 보호 원칙을 확인하세요.',
};

const securityTechs = [
  {
    icon: Lock,
    title: 'TLS 1.3 전송 암호화',
    description: '모든 클라이언트-서버 통신은 TLS 1.3으로 암호화됩니다. 평문 전송은 허용되지 않습니다.',
  },
  {
    icon: KeyRound,
    title: 'RS256 비대칭키 JWT 인증',
    description: '사용자 세션은 RS256 비대칭키 서명 JWT로 발급됩니다. 서버 측 블랙리스트와 Refresh Token Rotation을 함께 적용합니다.',
  },
  {
    icon: Database,
    title: 'Row-Level Security (RLS)',
    description: '데이터베이스 레이어에서 사용자별 데이터 격리를 강제합니다. 쿼리 레이어 우회 시에도 접근이 차단됩니다.',
  },
  {
    icon: Shield,
    title: 'CSRF 토큰 보호',
    description: '모든 상태 변경 요청에 CSRF 토큰 검증을 적용합니다. 이중 쿠키 검증 방식으로 교차 사이트 요청 위조를 차단합니다.',
  },
  {
    icon: ShieldAlert,
    title: '관리자 경로 난독화',
    description: '관리자 접근 경로는 환경 변수로 숨겨지며, 경로 노출 시에도 JWT 핑거프린트 검증으로 이중 보호됩니다.',
  },
  {
    icon: Server,
    title: '브루트포스 방어',
    description: 'IP 기반 로그인 시도 횟수 제한 및 잠금 정책을 적용합니다. 연속 실패 시 30분 자동 잠금이 활성화됩니다.',
  },
  {
    icon: Timer,
    title: '자동 세션 만료',
    description: 'Access Token은 15분, Refresh Token은 7일 후 자동 만료됩니다. 재사용 감지 시 전체 세션이 즉시 무효화됩니다.',
  },
  {
    icon: EyeOff,
    title: '외부 데이터 판매 없음',
    description: '사용자의 대화 내용, 결제 정보, 개인정보는 제3자에게 판매하거나 마케팅 목적으로 공유하지 않습니다.',
  },
  {
    icon: Users,
    title: 'RBAC 역할 기반 접근제어',
    description: '사용자·관리자·시스템 역할을 엄격히 분리합니다. 각 역할은 최소 권한 원칙에 따라 허용된 리소스에만 접근할 수 있으며, 권한 상승 시도는 서버 레이어에서 차단됩니다.',
  },
  {
    icon: Code2,
    title: 'DOMPurify XSS 방어',
    description: '사용자 입력과 AI 응답에 포함된 스크립트·이벤트 핸들러를 렌더링 전에 무해화합니다. 마크다운 렌더링 파이프라인 전 단계에 DOMPurify 정제를 적용하여 저장형·반사형 XSS를 차단합니다.',
  },
  {
    icon: FileKey,
    title: 'HMAC-SHA256 요청 서명',
    description: '관리자 API 및 크리티컬 작업 요청에 HMAC-SHA256 서명 검증을 적용합니다. 요청 위변조·재전송 공격을 방지하며, 타임스탬프 기반 리플레이 윈도우를 5분으로 제한합니다.',
  },
  {
    icon: HardDrive,
    title: 'AES-256-GCM 암호화',
    description: '민감 데이터는 AES-256-GCM 인증 암호화로 저장합니다. 12바이트 랜덤 IV와 16바이트 Auth Tag를 적용하며, 키 버전 접두사를 통해 키 롤링을 지원합니다.',
  },
  {
    icon: Smartphone,
    title: 'TOTP MFA (다단계 인증)',
    description: '관리자 계정에 시간 기반 일회용 패스워드(TOTP) 다단계 인증을 적용합니다. 30초 단위 갱신되는 6자리 코드로 비밀번호 단독 탈취 시에도 계정 접근을 차단합니다.',
  },
];

const transparencyStats = [
  { label: '서비스 시작 이후 데이터 유출', value: '0건' },
  { label: '외부 무단 공유·판매', value: '0건' },
  { label: '삭제 요청 처리율', value: '100%' },
  { label: '비공개 추가 보안 기술', value: '41개' },
];

const faqItems = [
  {
    q: '대화 내용이 AI 학습에 사용되나요?',
    a: 'Pick-My-AI는 사용자의 대화 내용을 AI 모델 학습에 사용하지 않습니다. 대화 데이터는 서비스 제공 목적으로만 처리됩니다.',
  },
  {
    q: '데이터 삭제는 어떻게 요청하나요?',
    a: '설정 메뉴의 자동 삭제 기능에서 즉시 삭제할 수 있습니다. 또는 이 페이지 하단의 문의 폼을 통해 데이터 삭제를 요청하실 수 있습니다.',
  },
  {
    q: '결제 정보는 안전하게 보관되나요?',
    a: '결제 정보는 PG사를 통해 처리되며, Pick-My-AI 서버에는 카드 번호 등 민감한 결제 정보가 저장되지 않습니다.',
  },
  {
    q: '계정 탈퇴 시 데이터는 어떻게 되나요?',
    a: '회원 탈퇴 시 개인 식별 데이터는 즉시 삭제됩니다. 관련 법령에 따라 일정 기간 보관이 필요한 정보는 해당 기간 후 삭제됩니다.',
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-100 sticky top-0 z-10 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">돌아가기</span>
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <span className="text-sm font-medium text-gray-900">보안</span>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-20">

        {/* 헤더 섹션 */}
        <div className="space-y-4 border-b border-gray-100 pb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Security</p>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight">
            사용자 데이터 보호는<br />우리의 기본 책임입니다.
          </h1>
          <p className="text-base text-gray-500 max-w-xl leading-relaxed">
            Pick-My-AI는 서비스 설계 단계부터 보안을 최우선으로 고려합니다.
            현재 적용 중인 주요 보안 기술의 일부를 공개합니다.
          </p>
        </div>

        {/* 적용 중인 보안 기술 */}
        <section className="space-y-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900">적용 중인 보안 기술</h2>
            <p className="text-sm text-gray-500">공개 가능한 항목만 표시됩니다. 추가 41개 항목은 보안상 비공개입니다.</p>
          </div>
          <div className="divide-y divide-gray-100 border-y border-gray-100">
            {securityTechs.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="py-6 flex items-start gap-5">
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg">
                    <Icon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">+ 비공개 보안 기술 41개 추가 적용 중.</span>{' '}
              상세 내용은 보안 취약점 악용 방지를 위해 공개하지 않습니다.
            </p>
          </div>
        </section>

        {/* 투명성 수치 */}
        <section className="space-y-8">
          <h2 className="text-xl font-bold text-gray-900">투명성 지표</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-gray-100 rounded-xl overflow-hidden">
            {transparencyStats.map((s) => (
              <div key={s.label} className="px-5 py-6 space-y-1">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            본 수치는 서비스 시작 이후 누적 데이터를 기준으로 합니다.
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">자주 묻는 질문</h2>
          <div className="divide-y divide-gray-100 border-y border-gray-100">
            {faqItems.map((item) => (
              <div key={item.q} className="py-6 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">{item.q}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 문의 */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900">보안 및 서비스 문의</h2>
            <p className="text-sm text-gray-500">
              크레딧, PMC, 모델, 보안 관련 문의를 접수하실 수 있습니다.
              스크린샷을 첨부하면 더 빠른 처리가 가능합니다.
            </p>
          </div>
          <InquiryForm />
        </section>

        {/* 개인정보처리방침 링크 */}
        <div className="border-t border-gray-100 pt-8 flex items-center justify-between">
          <p className="text-xs text-gray-400">© 2025 Pick-My-AI</p>
          <Link href="/privacy" className="text-xs text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-2">
            개인정보처리방침
          </Link>
        </div>
      </main>
    </div>
  );
}
