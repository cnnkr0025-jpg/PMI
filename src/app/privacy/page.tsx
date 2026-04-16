import { Sparkles, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">개인정보처리방침</h1>
        <p className="text-sm text-gray-500 mb-10">
          PickMyAI(이하 &quot;회사&quot;)는 이용자의 개인정보를 소중히 여기며, 개인정보보호법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 관련 법령을 준수합니다.
        </p>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. 개인정보 수집 항목 및 수집 방법</h2>
            <p className="mb-2">회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>필수 항목:</strong> 이메일 주소, 로그인 및 인증 정보(OAuth 제공자로부터 수신)</li>
              <li><strong>자동 수집 항목:</strong> 서비스 이용 기록, 접속 로그, IP 주소, 쿠키, 브라우저 정보</li>
              <li><strong>결제 시 수집:</strong> 결제 수단 정보, 거래 내역 (토스페이먼츠를 통해 처리)</li>
              <li><strong>서비스 이용 중 생성:</strong> AI 대화 내용, 모델 사용 이력, 크레딧/PMC 거래 내역</li>
            </ul>
            <p className="mt-2 text-sm text-gray-500">수집 방법: 회원 가입, 서비스 이용, 결제, 자동 생성 정보</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. 개인정보 수집 및 이용 목적</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회원 식별 및 로그인 기능 제공</li>
              <li>서비스 제공 및 기능 개선</li>
              <li>이용 기록 분석 및 서비스 품질 향상</li>
              <li>결제 처리 및 거래 내역 관리</li>
              <li>고객 문의 및 불만 처리</li>
              <li>부정 이용 방지 및 서비스 안정성 확보</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. 개인정보 보관 및 이용 기간</h2>
            <p className="mb-2">회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 다만, 관련 법령에 따라 보관이 필요한 경우 아래 기간 동안 보관합니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>계약 또는 청약철회 등에 관한 기록:</strong> 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
              <li><strong>대금결제 및 재화 등의 공급에 관한 기록:</strong> 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
              <li><strong>소비자의 불만 또는 분쟁처리에 관한 기록:</strong> 3년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
              <li><strong>표시/광고에 관한 기록:</strong> 6개월 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
              <li><strong>로그인 기록:</strong> 3개월 (통신비밀보호법)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. 개인정보의 제3자 제공 및 처리 위탁</h2>
            <p className="mb-2">회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 서비스 운영을 위해 다음과 같은 외부 서비스를 이용하며, 이용자의 대화 내용이 AI 응답 생성 목적으로 전송될 수 있습니다.</p>
            <div className="overflow-x-auto mt-3">
              <table className="min-w-full border border-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium">수탁업체</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium">위탁 업무</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium">제공 정보</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Supabase</td>
                    <td className="border border-gray-200 px-4 py-2">인증 및 데이터 저장</td>
                    <td className="border border-gray-200 px-4 py-2">이메일, 인증 정보, 서비스 데이터</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">토스페이먼츠</td>
                    <td className="border border-gray-200 px-4 py-2">결제 처리</td>
                    <td className="border border-gray-200 px-4 py-2">결제 정보, 거래 내역</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">OpenAI</td>
                    <td className="border border-gray-200 px-4 py-2">AI 응답 생성</td>
                    <td className="border border-gray-200 px-4 py-2">대화 내용 (AI 모델 호출 시)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Anthropic</td>
                    <td className="border border-gray-200 px-4 py-2">AI 응답 생성</td>
                    <td className="border border-gray-200 px-4 py-2">대화 내용 (AI 모델 호출 시)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Google (Gemini)</td>
                    <td className="border border-gray-200 px-4 py-2">AI 응답 생성</td>
                    <td className="border border-gray-200 px-4 py-2">대화 내용 (AI 모델 호출 시)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Perplexity</td>
                    <td className="border border-gray-200 px-4 py-2">AI 응답 생성</td>
                    <td className="border border-gray-200 px-4 py-2">대화 내용 (AI 모델 호출 시)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">xAI (Grok)</td>
                    <td className="border border-gray-200 px-4 py-2">AI 응답 생성</td>
                    <td className="border border-gray-200 px-4 py-2">대화 내용 (AI 모델 호출 시)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. 개인정보의 파기 절차 및 방법</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>파기 절차:</strong> 이용자가 회원 탈퇴를 요청하거나 개인정보 수집 목적이 달성된 경우, 관련 법령에 따른 보관 기간 경과 후 지체 없이 파기합니다.</li>
              <li><strong>파기 방법:</strong> 전자적 파일 형태의 정보는 기술적 방법을 사용하여 복구 불가능하도록 삭제합니다.</li>
              <li><strong>탈퇴 시:</strong> 회원 탈퇴 요청 시 개인정보는 즉시 삭제되며, 법령에 따라 보관이 필요한 정보는 별도의 데이터베이스로 옮겨 일정 기간 보관 후 파기합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. 이용자의 권리와 행사 방법</h2>
            <p className="mb-2">이용자(또는 법정대리인)는 언제든지 본인의 개인정보에 대해 다음 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>개인정보 열람 요청</li>
              <li>개인정보 정정 요청</li>
              <li>개인정보 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
            </ul>
            <p className="mt-2">위 권리 행사는 서비스 내 설정 또는 고객센터를 통해 요청할 수 있으며, 회사는 지체 없이 필요한 조치를 취합니다.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. 쿠키(Cookie)의 사용</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>회사는 이용자의 편의를 위해 쿠키를 사용합니다. 쿠키는 서비스 이용 시 브라우저에 저장되는 소량의 텍스트 파일입니다.</li>
              <li><strong>사용 목적:</strong> 로그인 상태 유지, 서비스 설정 저장, 이용 패턴 분석</li>
              <li><strong>쿠키 거부 방법:</strong> 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으며, 이 경우 일부 서비스 이용에 제한이 있을 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. 개인정보 보호를 위한 기술적·관리적 조치</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>개인정보의 암호화 저장 및 전송 (SSL/TLS)</li>
              <li>해킹 등에 대비한 기술적 대책 (방화벽, 침입 탐지 시스템)</li>
              <li>개인정보 접근 권한 제한 및 관리</li>
              <li>개인정보 취급 직원의 최소화 및 교육</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. 개인정보 보호책임자</h2>
            <p className="mb-2">회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 이용자의 개인정보 관련 문의를 처리하기 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
            <div className="bg-gray-50 rounded-lg p-4 mt-2">
              <p><strong>개인정보 보호책임자</strong></p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>성명: {process.env.NEXT_PUBLIC_DPO_NAME || '(추후 공개)'}</li>
                <li>직위: 개인정보 보호책임자</li>
                <li>이메일: {process.env.NEXT_PUBLIC_DPO_EMAIL || 'privacy@pickmyai.com'}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. 권익침해 구제 방법</h2>
            <p className="mb-2">이용자는 개인정보 침해에 대한 피해구제, 상담 등을 아래 기관에 문의할 수 있습니다.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>개인정보침해 신고센터 (한국인터넷진흥원): privacy.kisa.or.kr / 전화 118</li>
              <li>개인정보 분쟁조정위원회: www.kopico.go.kr / 전화 1833-6972</li>
              <li>대검찰청 사이버수사과: www.spo.go.kr / 전화 1301</li>
              <li>경찰청 사이버수사국: ecrm.cyber.go.kr / 전화 182</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. 개인정보처리방침의 변경</h2>
            <p>본 방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지를 통해 변경 사항을 사전에 안내합니다. 변경된 방침은 공지한 시행일로부터 효력이 발생합니다.</p>
          </section>

          <section className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">부칙</h2>
            <p>본 개인정보처리방침은 2025년 1월 1일부터 시행됩니다.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
