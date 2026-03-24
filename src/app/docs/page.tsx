'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Coins, TrendingUp, Shield, Clock, Info, CheckCircle, Zap, BookOpen, Lightbulb, Users, Target, Award } from 'lucide-react';

export default function DocsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <Button
            onClick={() => router.push('/dashboard')}
            variant="ghost"
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            대시보드로 돌아가기
          </Button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Pick-My-AI 가이드</h1>
          <p className="text-gray-600">PMC 시스템과 서비스 이용 방법을 안내합니다</p>
        </div>

        {/* PMC 소개 */}
        <Card variant="elevated" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">PMC (Pick-My-Coin)란?</h2>
                <p className="text-sm text-gray-600">Pick-My-AI의 내부 화폐 시스템</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <p className="text-gray-800 font-medium mb-2">💰 1 PMC = 1원</p>
                <p className="text-sm text-gray-700">
                  PMC는 결제 시 현금처럼 사용할 수 있는 내부 화폐입니다. 
                  적립금이나 포인트가 아닌, 실제 돈처럼 사용되는 코인 시스템입니다.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">결제 시 사용 가능</p>
                    <p className="text-sm text-gray-600">결제 금액의 최대 30%까지 PMC로 결제</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">자동 적립</p>
                    <p className="text-sm text-gray-600">결제 시 자동으로 PMC 적립</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center mt-1 flex-shrink-0">
                    <span className="text-red-600 text-xs font-bold">✕</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">현금 인출 불가</p>
                    <p className="text-sm text-gray-600">PMC는 현금으로 환전할 수 없습니다</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center mt-1 flex-shrink-0">
                    <span className="text-red-600 text-xs font-bold">✕</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">외부 전송 불가</p>
                    <p className="text-sm text-gray-600">다른 사용자에게 전송할 수 없습니다</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PMC 적립 방법 */}
        <Card variant="bordered" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-bold text-gray-900">PMC 적립 방법</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">📊 기본 적립률 (모델 개수 기반)</h3>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-2">
                    <span className="font-mono bg-white px-2 py-1 rounded">적립률 = min(5% × (모델 개수 - 1), 30%)</span>
                  </p>
                  <div className="space-y-1 text-sm text-gray-600 mt-3">
                    <p>• 모델 1개: 0% 적립</p>
                    <p>• 모델 2개: 5% 적립</p>
                    <p>• 모델 3개: 10% 적립</p>
                    <p>• 모델 4개: 15% 적립</p>
                    <p>• 모델 7개 이상: 30% 적립 (최대)</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">🎁 플랜별 추가 적립</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-600 mb-1">Free</p>
                    <p className="text-lg font-bold text-gray-900">+0%</p>
                  </div>
                  <div className="bg-blue-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-600 mb-1">Plus</p>
                    <p className="text-lg font-bold text-blue-700">+2%</p>
                  </div>
                  <div className="bg-purple-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-purple-600 mb-1">Pro</p>
                    <p className="text-lg font-bold text-purple-700">+5%</p>
                  </div>
                  <div className="bg-orange-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-orange-600 mb-1">Max</p>
                    <p className="text-lg font-bold text-orange-700">+7%</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3">🛡️ 고가 모델 보호장치</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-3">
                    고가 모델(Claude Opus 등)은 적립률 상한이 적용됩니다:
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">저가 모델 (GPT-4o mini 등)</span>
                      <span className="font-semibold text-green-600">최대 30%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">중간가 모델 (GPT-4o 등)</span>
                      <span className="font-semibold text-blue-600">최대 15%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">고가 모델 (Claude Opus 등)</span>
                      <span className="font-semibold text-orange-600">최대 7%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
                <p className="text-sm font-medium text-green-800 mb-1">💡 적립 팁</p>
                <p className="text-sm text-green-700">
                  여러 모델을 함께 구매하면 적립률이 높아집니다! 
                  필요한 모델들을 한 번에 구매하는 것이 유리합니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PMC 사용 방법 */}
        <Card variant="bordered" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins className="w-6 h-6 text-yellow-600" />
              <h2 className="text-xl font-bold text-gray-900">PMC 사용 방법</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">결제 시 자동 차감</h3>
                <p className="text-sm text-gray-600 mb-3">
                  결제 페이지에서 &ldquo;PMC 사용&rdquo; 체크박스를 선택하면 보유한 PMC가 자동으로 차감됩니다.
                </p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">총 결제 금액</span>
                      <span className="font-semibold">10,000원</span>
                    </div>
                    <div className="flex justify-between text-yellow-600">
                      <span>PMC 사용</span>
                      <span className="font-semibold">-3,000원</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span className="font-semibold text-gray-900">실제 결제 금액</span>
                      <span className="font-bold text-blue-600">7,000원</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-yellow-800 mb-1">사용 제한</p>
                    <p className="text-sm text-yellow-700">
                      1회 결제 시 결제 금액의 <span className="font-bold">최대 30%</span>까지만 PMC로 사용할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PMC 유효기간 */}
        <Card variant="bordered" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">PMC 유효기간</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-lg font-semibold text-blue-900 mb-2">적립일로부터 90일</p>
                <p className="text-sm text-blue-700">
                  적립된 PMC는 90일 후 자동으로 만료됩니다. 
                  만료 전에 사용하지 않으면 소멸되니 주의하세요!
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">만료 예정 알림</h3>
                <p className="text-sm text-gray-600">
                  만료 예정인 PMC가 있을 경우 대시보드에서 알림을 받을 수 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI 모델 사용 가이드 */}
        <Card variant="bordered" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-gray-900">AI 모델 사용 가이드</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-600" />
                  모델 선택 가이드
                </h3>
                <div className="space-y-3">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="font-medium text-blue-900 mb-2">💬 일반 대화 & 간단한 작업</p>
                    <p className="text-sm text-blue-700 mb-2">GPT-4o mini, Claude Haiku 추천</p>
                    <p className="text-xs text-blue-600">빠른 응답 속도와 저렴한 비용으로 일상적인 질문에 적합합니다.</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="font-medium text-purple-900 mb-2">🎨 창작 & 복잡한 분석</p>
                    <p className="text-sm text-purple-700 mb-2">GPT-4o, Claude Sonnet 추천</p>
                    <p className="text-xs text-purple-600">균형잡힌 성능으로 대부분의 작업을 효과적으로 처리합니다.</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <p className="font-medium text-orange-900 mb-2">🚀 전문가급 작업 & 고난이도 문제</p>
                    <p className="text-sm text-orange-700 mb-2">GPT-4, Claude Opus 추천</p>
                    <p className="text-xs text-orange-600">최고 수준의 추론 능력이 필요한 전문적인 작업에 최적화되어 있습니다.</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="font-medium text-green-900 mb-2">🖼️ 이미지 생성</p>
                    <p className="text-sm text-green-700 mb-2">DALL-E 3 추천</p>
                    <p className="text-xs text-green-600">텍스트 설명만으로 고품질 이미지를 생성할 수 있습니다.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-green-600" />
                  크레딧 시스템 이해하기
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 font-bold text-xs">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">모델별 크레딧 구매</p>
                        <p className="text-gray-600">각 AI 모델마다 별도의 크레딧을 구매해야 합니다. 한 모델의 크레딧으로 다른 모델을 사용할 수 없습니다.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 font-bold text-xs">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">크레딧 = 사용 횟수</p>
                        <p className="text-gray-600">1 크레딧 = 1회 대화 또는 1회 이미지 생성. 간단하고 명확한 시스템입니다.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-blue-600 font-bold text-xs">3</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">유효기간 없음</p>
                        <p className="text-gray-600">구매한 크레딧은 만료되지 않습니다. 언제든지 사용 가능합니다.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-600" />
                  효율적인 사용 팁
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                    <p className="font-medium text-blue-900 mb-2">명확한 질문하기</p>
                    <p className="text-sm text-blue-700">구체적이고 명확한 질문일수록 더 정확한 답변을 받을 수 있습니다.</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                    <p className="font-medium text-purple-900 mb-2">적절한 모델 선택</p>
                    <p className="text-sm text-purple-700">작업의 난이도에 맞는 모델을 선택하면 비용을 절약할 수 있습니다.</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                    <p className="font-medium text-green-900 mb-2">대화 이력 활용</p>
                    <p className="text-sm text-green-700">이전 대화 맥락을 활용하면 더 자연스러운 대화가 가능합니다.</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-4 border border-orange-200">
                    <p className="font-medium text-orange-900 mb-2">모델 비교 기능</p>
                    <p className="text-sm text-orange-700">여러 모델의 답변을 비교하여 최적의 결과를 선택하세요.</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 실전 활용 예시 */}
        <Card variant="bordered" className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-teal-600" />
              <h2 className="text-xl font-bold text-gray-900">실전 활용 예시</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <p className="font-semibold text-gray-900 mb-1">학습 & 교육</p>
                <p className="text-sm text-gray-600 mb-2">복잡한 개념 설명, 문제 풀이, 학습 자료 요약</p>
                <p className="text-xs text-blue-600">추천 모델: GPT-4o, Claude Sonnet</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <p className="font-semibold text-gray-900 mb-1">업무 & 생산성</p>
                <p className="text-sm text-gray-600 mb-2">이메일 작성, 보고서 초안, 데이터 분석, 회의록 정리</p>
                <p className="text-xs text-purple-600">추천 모델: GPT-4o, Claude Sonnet</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4 py-2">
                <p className="font-semibold text-gray-900 mb-1">창작 & 디자인</p>
                <p className="text-sm text-gray-600 mb-2">글쓰기, 브레인스토밍, 이미지 생성, 아이디어 발전</p>
                <p className="text-xs text-green-600">추천 모델: Claude Opus (글), DALL-E 3 (이미지)</p>
              </div>
              <div className="border-l-4 border-orange-500 pl-4 py-2">
                <p className="font-semibold text-gray-900 mb-1">개발 & 기술</p>
                <p className="text-sm text-gray-600 mb-2">코드 작성, 디버깅, 기술 문서 작성, 아키텍처 설계</p>
                <p className="text-xs text-orange-600">추천 모델: GPT-4, Claude Opus</p>
              </div>
              <div className="border-l-4 border-red-500 pl-4 py-2">
                <p className="font-semibold text-gray-900 mb-1">번역 & 언어</p>
                <p className="text-sm text-gray-600 mb-2">다국어 번역, 문법 교정, 언어 학습 지원</p>
                <p className="text-xs text-red-600">추천 모델: GPT-4o, Claude Sonnet</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 자주 묻는 질문 */}
        <Card variant="bordered">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="w-6 h-6 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-900">자주 묻는 질문</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Q. PMC를 현금으로 환전할 수 있나요?</h3>
                <p className="text-sm text-gray-600">
                  A. 아니요, PMC는 Pick-My-AI 내에서만 사용 가능한 내부 화폐로 현금 환전이 불가능합니다.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Q. PMC를 다른 사람에게 선물할 수 있나요?</h3>
                <p className="text-sm text-gray-600">
                  A. 현재는 PMC 선물 기능이 지원되지 않습니다.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Q. 모델을 1개만 구매하면 PMC가 적립되지 않나요?</h3>
                <p className="text-sm text-gray-600">
                  A. 네, 모델 1개 구매 시에는 PMC가 적립되지 않습니다. 2개 이상 구매 시부터 적립이 시작됩니다.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Q. 고가 모델만 구매해도 30% 적립되나요?</h3>
                <p className="text-sm text-gray-600">
                  A. 아니요, 고가 모델(Claude Opus 등)은 최대 7%까지만 적립됩니다. 
                  여러 모델을 함께 구매하면 가중 평균으로 적립률이 계산됩니다.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Q. PMC 유효기간을 연장할 수 있나요?</h3>
                <p className="text-sm text-gray-600">
                  A. 유효기간 연장은 지원되지 않습니다. 90일 이내에 사용하시기 바랍니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 추가 혜택 안내 */}
        <Card variant="elevated" className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="w-6 h-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-gray-900">추가 혜택</h2>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">무료 체험 크레딧</p>
                  <p className="text-sm text-gray-600">신규 가입 시 각 모델별 무료 크레딧을 제공합니다.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">대화 템플릿</p>
                  <p className="text-sm text-gray-600">자주 사용하는 프롬프트를 템플릿으로 저장하여 빠르게 재사용할 수 있습니다.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">대화 이력 저장</p>
                  <p className="text-sm text-gray-600">모든 대화 내역이 자동으로 저장되어 언제든지 다시 확인할 수 있습니다.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">다크모드 지원</p>
                  <p className="text-sm text-gray-600">눈의 피로를 줄이는 다크모드와 7가지 테마 색상을 제공합니다.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI 에러 보험 보장 배수 표 */}
        <Card variant="elevated" className="mb-6 border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">AI 에러 보험 — 모델별 보장 배수</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              에러 보험(500원) 구매 시 AI 응답 오류 발생 때 아래 배수만큼 크레딧을 환불해드립니다.
              보험 미구매 시에도 에러 발생 시 <strong>기본 1크레딧은 무조건 환불</strong>됩니다.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="text-left p-3 font-semibold text-gray-800 border border-blue-200 rounded-tl-lg">모델</th>
                    <th className="text-center p-3 font-semibold text-gray-800 border border-blue-200">단가 (원/크레딧)</th>
                    <th className="text-center p-3 font-semibold text-gray-800 border border-blue-200">보험 보장 배수</th>
                    <th className="text-center p-3 font-semibold text-gray-800 border border-blue-200 rounded-tr-lg">보험 없을 때</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Perplexity Sonar', piWon: 1, multiplier: 500, special: true },
                    { name: 'GPT-5', piWon: 7, multiplier: Math.floor(500/7)+1 },
                    { name: 'GPT-4.1', piWon: 8, multiplier: Math.floor(500/8)+1 },
                    { name: 'GPT-4o', piWon: 10, multiplier: Math.floor(500/10)+1 },
                    { name: 'Claude Haiku 3.5', piWon: 5, multiplier: Math.floor(500/5)+1 },
                    { name: 'Claude Haiku 4.5', piWon: 15, multiplier: Math.floor(500/15)+1 },
                    { name: 'Perplexity Sonar Pro', piWon: 15, multiplier: Math.floor(500/15)+1 },
                    { name: 'Claude Sonnet 4.5/4.6', piWon: 45, multiplier: Math.floor(500/45)+1 },
                    { name: 'Claude Opus 4.5/4.6', piWon: 79, multiplier: Math.floor(500/79)+1 },
                    { name: 'Claude Opus 4/4.1', piWon: 199, multiplier: Math.floor(500/199)+1 },
                    { name: 'Gemini 3.0 Pro', piWon: 250, multiplier: Math.floor(500/250)+1 },
                    { name: 'Grok 3', piWon: 39, multiplier: Math.floor(500/39)+1 },
                    { name: 'o3', piWon: 48, multiplier: Math.floor(500/48)+1 },
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                      <td className="p-3 border border-blue-100 font-medium text-gray-800">
                        {row.name}
                      </td>
                      <td className="p-3 border border-blue-100 text-center text-gray-700">{row.piWon}원</td>
                      <td className="p-3 border border-blue-100 text-center">
                        <span className={`font-bold ${row.special ? 'text-yellow-600 text-base' : 'text-blue-700'}`}>
                          {row.multiplier}배
                        </span>
                        {row.special && <span className="ml-1 text-xs text-yellow-500">(최대)</span>}
                      </td>
                      <td className="p-3 border border-blue-100 text-center text-gray-500">1크레딧</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <strong>계산 공식:</strong> 보장 배수 = floor(500 ÷ 단가) + 1배 &nbsp;|&nbsp;
              Perplexity Sonar는 예외적으로 <strong>500배 고정</strong> 보장
            </div>
          </CardContent>
        </Card>

        {/* 하단 CTA */}
        <div className="mt-8 text-center space-y-4">
          <Button
            onClick={() => router.push('/configurator')}
            variant="primary"
            size="lg"
            className="px-8"
          >
            지금 바로 시작하기
          </Button>
          <p className="text-sm text-gray-500">
            더 궁금한 사항이 있으신가요? <button onClick={() => router.push('/feedback')} className="text-blue-600 hover:underline">문의하기</button>
          </p>
        </div>
      </div>
    </div>
  );
}
