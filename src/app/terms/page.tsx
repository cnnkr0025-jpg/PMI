import { Sparkles, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center space-x-4">
          <a
            href="/login"
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">돌아가기</span>
          </a>
          <div className="h-5 w-px bg-gray-300" />
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Pick-My-AI</span>
          </div>
        </div>
      </header>

      {/* 본문 */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">PickMyAI 이용약관</h1>
        <p className="text-sm text-gray-500 mb-10">
          본 약관은 PickMyAI(이하 &quot;회사&quot;)가 제공하는 AI 서비스 플랫폼 PickMyAI(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제1조 (목적)</h2>
            <p>본 약관은 이용자가 회사가 제공하는 서비스를 이용함에 있어 필요한 조건, 절차 및 책임사항을 규정함을 목적으로 합니다.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제2조 (정의)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>서비스란 회사가 제공하는 AI 기반 정보 제공 및 도구를 의미합니다.</li>
              <li>이용자란 본 약관에 동의하고 서비스를 이용하는 회원을 의미합니다.</li>
              <li>계정이란 이용자의 식별 및 서비스 이용을 위해 생성된 로그인 정보를 의미합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제3조 (약관의 효력 및 변경)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>본 약관은 이용자가 서비스에 가입하거나 이용하는 시점부터 효력을 가집니다.</li>
              <li>회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 서비스 내 공지합니다.</li>
              <li>변경된 약관에 동의하지 않을 경우 이용자는 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제4조 (회원 가입 및 계정 관리)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>이용자는 정확한 정보를 제공하여 회원 가입을 해야 합니다.</li>
              <li>이용자는 본인의 계정 정보를 스스로 관리할 책임이 있으며, 제3자에게 양도 또는 공유할 수 없습니다.</li>
              <li>계정의 부정 사용으로 발생한 모든 책임은 이용자에게 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제5조 (서비스의 제공 및 변경)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사는 AI 기반 정보 제공, 도구, 콘텐츠 등을 제공합니다.</li>
              <li>회사는 서비스의 일부 또는 전부를 변경, 중단할 수 있으며 이에 대해 사전 또는 사후에 공지할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제6조 (AI 서비스에 대한 고지)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>서비스에서 제공되는 AI의 응답, 결과물, 추천 내용은 참고용 정보입니다.</li>
              <li>AI의 결과는 오류, 부정확성, 한계가 존재할 수 있으며 회사는 결과의 정확성, 완전성, 신뢰성을 보장하지 않습니다.</li>
              <li>이용자는 AI 결과를 최종 판단의 근거로 단독 사용해서는 안 되며, 그에 따른 책임은 전적으로 이용자에게 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제7조 (PMC — Pick-My-Coin)</h2>
            <p className="mb-2">PMC(Pick-My-Coin)는 Pick-My-AI 서비스 내에서만 사용할 수 있는 포인트입니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>PMC는 AI 모델 구매 시 할인에 사용하거나 일부 유료 기능 구매에 사용할 수 있습니다.</li>
              <li>PMC는 현금으로 환전되거나 제3자에게 양도될 수 없습니다.</li>
              <li>PMC는 적립일로부터 일정 기간 내 유효하며, 만료된 PMC는 자동 소멸됩니다.</li>
              <li>회사는 서비스 정책에 따라 PMC 적립 비율, 사용 조건, 유효 기간 등을 변경할 수 있으며, 변경 시 서비스 내 공지를 통해 사전 안내합니다.</li>
              <li>부정한 방법으로 PMC를 취득하거나 사용하는 경우 해당 PMC는 환수될 수 있으며 계정 이용이 제한될 수 있습니다.</li>
              <li>서비스 탈퇴 시 잔여 PMC는 소멸되며 환급되지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제8조 (이용 제한 및 계정 정지)</h2>
            <p className="mb-2">회사는 다음 각 호에 해당하는 경우 사전 통보 없이 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>서비스의 정상적인 운영을 방해하는 경우</li>
              <li>불법 행위 또는 약관 위반 행위가 확인된 경우</li>
              <li>타인의 권리 또는 명예를 침해하는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제9조 (면책 조항)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사는 천재지변, 시스템 장애 등 불가항력 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
              <li>회사는 이용자가 서비스를 이용하여 얻은 정보로 인해 발생한 손해에 대해 책임을 지지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제10조 (준거법 및 관할)</h2>
            <p>본 약관은 대한민국 법을 준거법으로 하며, 서비스와 관련된 분쟁은 회사의 본점 소재지를 관할하는 법원을 전속 관할로 합니다.</p>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">부칙</h2>
            <p>본 약관은 서비스 게시일로부터 적용됩니다.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
