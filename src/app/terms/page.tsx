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
              <li>&quot;서비스&quot;란 회사가 제공하는 AI 기반 정보 제공 및 도구를 의미합니다.</li>
              <li>&quot;이용자&quot;란 본 약관에 동의하고 서비스를 이용하는 회원을 의미합니다.</li>
              <li>&quot;계정&quot;이란 이용자의 식별 및 서비스 이용을 위해 생성된 로그인 정보를 의미합니다.</li>
              <li>&quot;크레딧&quot;이란 AI 모델 사용을 위해 구매하는 유료 이용권을 의미합니다.</li>
              <li>&quot;PMC(Pick-My-Coin)&quot;란 서비스 내에서 할인 및 일부 유료 기능 구매에 사용할 수 있는 포인트를 의미합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제3조 (약관의 효력 및 변경)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>본 약관은 이용자가 서비스에 가입하거나 이용하는 시점부터 효력을 가집니다.</li>
              <li>회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전(이용자에게 불리한 변경의 경우 30일 전)까지 서비스 내 공지합니다.</li>
              <li>변경된 약관에 동의하지 않을 경우 이용자는 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
              <li>이용자가 변경된 약관의 시행일 이후에도 서비스를 계속 이용하는 경우, 변경된 약관에 동의한 것으로 간주합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제4조 (회원 가입 및 계정 관리)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>이용자는 만 14세 이상이어야 회원 가입이 가능합니다. 만 14세 미만의 아동은 법정대리인의 동의 없이 서비스에 가입할 수 없습니다.</li>
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
              <li>서비스 변경으로 인해 이용자에게 불이익이 발생하는 경우, 회사는 변경 사항을 최소 7일 전에 공지합니다.</li>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제7조 (유료 서비스 및 결제)</h2>
            <p className="mb-2">회사는 AI 모델 이용을 위한 유료 크레딧 및 관련 서비스를 제공합니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>유료 서비스의 가격, 이용 조건 등은 서비스 내 결제 화면에 표시됩니다.</li>
              <li>결제는 토스페이먼츠를 통해 신용카드, 체크카드, 계좌이체, 간편결제 등의 방식으로 처리됩니다.</li>
              <li>결제가 완료되면 해당 크레딧이 이용자의 계정에 즉시 충전됩니다.</li>
              <li>긴 대화(60개 메시지 초과) 시 세션 유지를 위해 추가 요금(25 PMC)이 발생할 수 있으며, 해당 시점에 사전 안내됩니다.</li>
              <li>회사는 결제 금액, 결제일, 결제 수단 등 거래 내역을 이용자가 확인할 수 있도록 제공합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제8조 (청약철회 및 환불)</h2>
            <p className="mb-2">이용자는 전자상거래 등에서의 소비자보호에 관한 법률에 따라 다음과 같이 청약철회 및 환불을 신청할 수 있습니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>미사용 크레딧에 한하여 결제일로부터 7일 이내에 환불을 신청할 수 있습니다.</li>
              <li>이미 사용된 크레딧(AI 모델 호출에 소비된 크레딧)은 환불 대상에서 제외됩니다.</li>
              <li>디지털 콘텐츠의 특성상, 크레딧을 사용하여 AI 응답을 수신한 경우에는 해당 크레딧에 대한 청약철회가 제한될 수 있습니다. 이 경우 회사는 결제 전 이를 고지합니다.</li>
              <li>환불 신청은 서비스 내 문의 채널 또는 고객센터를 통해 접수할 수 있습니다.</li>
              <li>환불은 신청일로부터 영업일 기준 3일 이내에 원래 결제 수단으로 처리됩니다.</li>
              <li>PMC(Pick-My-Coin)는 무상 적립 포인트로서 현금 환불 대상이 아닙니다.</li>
              <li>서비스 탈퇴 시 잔여 크레딧 및 PMC는 소멸되므로, 탈퇴 전 환불 신청을 권장합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제9조 (PMC — Pick-My-Coin)</h2>
            <p className="mb-2">PMC(Pick-My-Coin)는 Pick-My-AI 서비스 내에서만 사용할 수 있는 포인트입니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>PMC는 AI 모델 구매 시 할인에 사용하거나 일부 유료 기능 구매에 사용할 수 있습니다.</li>
              <li>PMC는 현금으로 환전되거나 제3자에게 양도될 수 없습니다.</li>
              <li>PMC는 적립일로부터 90일간 유효하며, 만료된 PMC는 자동 소멸됩니다.</li>
              <li>회사는 서비스 정책에 따라 PMC 적립 비율, 사용 조건, 유효 기간 등을 변경할 수 있으며, 변경 시 서비스 내 공지를 통해 사전 안내합니다.</li>
              <li>부정한 방법으로 PMC를 취득하거나 사용하는 경우 해당 PMC는 환수될 수 있으며 계정 이용이 제한될 수 있습니다.</li>
              <li>서비스 탈퇴 시 잔여 PMC는 소멸되며 환급되지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제10조 (이용 제한 및 계정 정지)</h2>
            <p className="mb-2">회사는 다음 각 호에 해당하는 경우 사전 통보 없이 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>서비스의 정상적인 운영을 방해하는 경우</li>
              <li>불법 행위 또는 약관 위반 행위가 확인된 경우</li>
              <li>타인의 권리 또는 명예를 침해하는 경우</li>
              <li>AI 이용 정책에 반하는 부적절한 콘텐츠를 입력하는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제11조 (개인정보 보호)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사는 이용자의 개인정보를 개인정보보호법 및 정보통신망법 등 관련 법령에 따라 보호합니다.</li>
              <li>개인정보의 수집, 이용, 보관, 파기 등에 관한 사항은 별도의 개인정보처리방침에 따릅니다.</li>
              <li>회사는 이용자의 대화 내용을 AI 모델 제공사(OpenAI, Anthropic, Google 등)에 전송하며, 이에 대한 사항은 개인정보처리방침에 명시합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제12조 (면책 조항)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사는 천재지변, 시스템 장애 등 불가항력 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
              <li>회사는 이용자가 서비스를 이용하여 얻은 정보로 인해 발생한 손해에 대해 책임을 지지 않습니다.</li>
              <li>회사는 이용자 간 또는 이용자와 제3자 간에 서비스를 매개로 발생한 분쟁에 대해 책임을 지지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제13조 (손해배상)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사가 고의 또는 중대한 과실로 이용자에게 손해를 끼친 경우, 회사는 그 손해를 배상합니다.</li>
              <li>회사의 손해배상 범위는 이용자가 실제 지급한 서비스 이용 대금을 한도로 합니다. 다만, 회사의 고의 또는 중대한 과실에 의한 경우에는 그러하지 아니합니다.</li>
              <li>이용자가 본 약관을 위반하여 회사에 손해를 끼친 경우, 이용자는 그 손해를 배상하여야 합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">제14조 (분쟁 해결)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>서비스 이용과 관련하여 회사와 이용자 간에 분쟁이 발생한 경우, 양 당사자는 원만한 해결을 위해 성실히 협의합니다.</li>
              <li>분쟁이 해결되지 않을 경우, 이용자는 한국소비자원(www.kca.go.kr, 1372), 한국인터넷진흥원 개인정보침해 신고센터(privacy.kisa.or.kr, 118), 또는 전자거래분쟁조정위원회에 조정을 신청할 수 있습니다.</li>
              <li>소송이 필요한 경우 대한민국 법을 준거법으로 하며, 민사소송법에 따른 관할 법원에 제소합니다.</li>
            </ul>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">부칙</h2>
            <p>본 약관은 2025년 1월 1일부터 시행됩니다.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
