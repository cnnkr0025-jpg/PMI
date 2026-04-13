/**
 * PickMyAI Shadow Dataset — Layer 20
 *
 * 시간 일관형 합성 데이터셋 생성기.
 * Shadow 대상에게 계정별 seed 기반 plausible synthetic state 제공.
 *
 * 규칙:
 *   - 고정값 99,999 PMC 금지
 *   - 가짜 결제/가짜 히스토리도 시간 일관성 유지
 *   - 응답 지연도 실제 시스템과 유사하게 보정
 *   - 실제 데이터는 단 1바이트도 Shadow에 유입되지 않음
 */

// ── Seeded PRNG (Mulberry32) ──
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticBalance {
  amount: number;
  updatedAt: string;
}

export interface SyntheticTransaction {
  id: string;
  type: 'earn' | 'charge' | 'use';
  amount: number;
  description: string;
  createdAt: string;
}

export interface SyntheticWalletState {
  balance: SyntheticBalance;
  transactions: SyntheticTransaction[];
  credits: Record<string, number>;
}

/**
 * seed 기반 합성 잔액 생성
 * - 사용자마다 다르지만 동일 seed면 항상 같은 결과
 * - plausible 범위: 500 ~ 25,000 PMC
 */
export function generateSyntheticBalance(seed: number): SyntheticBalance {
  const rng = mulberry32(seed);
  const amount = Math.floor(500 + rng() * 24500);
  const hoursAgo = Math.floor(rng() * 48);
  const updatedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return { amount, updatedAt };
}

/**
 * seed 기반 합성 거래 내역 생성
 * - 최근 30일분 plausible 히스토리
 * - 시간순 정렬, 잔액 일관성 유지
 */
export function generateSyntheticTransactions(seed: number, count: number = 20): SyntheticTransaction[] {
  const rng = mulberry32(seed + 1);
  const transactions: SyntheticTransaction[] = [];
  const types: Array<'earn' | 'charge' | 'use'> = ['earn', 'charge', 'use'];
  const descriptions = {
    earn: ['구독 적립', 'PMC 리워드', '이벤트 보너스', '추천인 적립'],
    charge: ['카드 충전', '토스페이 충전', '간편결제 충전'],
    use: ['GPT-4o 사용', 'Claude Sonnet 사용', 'Gemini Pro 사용', 'Perplexity 사용', 'DALL-E 사용'],
  };

  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(rng() * types.length);
    const type = types[typeIdx];
    const descList = descriptions[type];
    const desc = descList[Math.floor(rng() * descList.length)];

    let amount: number;
    if (type === 'earn') {
      amount = Math.floor(50 + rng() * 500);
    } else if (type === 'charge') {
      amount = Math.floor(1000 + rng() * 10000);
    } else {
      amount = -Math.floor(10 + rng() * 200);
    }

    const daysAgo = Math.floor(rng() * 30);
    const hoursInDay = Math.floor(rng() * 24);
    const createdAt = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000 - hoursInDay * 60 * 60 * 1000,
    ).toISOString();

    transactions.push({
      id: `syn-${seed}-${i}`,
      type,
      amount,
      description: desc,
      createdAt,
    });
  }

  // 시간순 정렬 (최신 먼저)
  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return transactions;
}

/**
 * seed 기반 합성 크레딧 (모델별 잔여 횟수)
 */
export function generateSyntheticCredits(seed: number): Record<string, number> {
  const rng = mulberry32(seed + 2);
  const models = [
    'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'claude-3-5-haiku',
    'gemini-2.0-flash', 'perplexity-sonar',
  ];
  const credits: Record<string, number> = {};
  for (const m of models) {
    if (rng() > 0.3) { // 70% 확률로 모델 보유
      credits[m] = Math.floor(1 + rng() * 30);
    }
  }
  return credits;
}

/**
 * 완전한 합성 지갑 상태 생성 (API 응답용)
 */
export function generateSyntheticWalletState(seed: number): SyntheticWalletState {
  return {
    balance: generateSyntheticBalance(seed),
    transactions: generateSyntheticTransactions(seed),
    credits: generateSyntheticCredits(seed),
  };
}

/**
 * 합성 AI 응답 생성 (Shadow 모드 채팅)
 * 실제 AI provider 호출 없이 plausible 응답 반환
 */
export function generateSyntheticAiResponse(seed: number, userMessage: string): string {
  const rng = mulberry32(seed + userMessage.length);
  const responses = [
    '네, 이해했습니다. 좀 더 구체적으로 설명해 드리겠습니다.\n\n',
    '좋은 질문입니다. 다음과 같이 정리할 수 있습니다.\n\n',
    '물론이죠. 자세히 살펴보겠습니다.\n\n',
    '이 부분에 대해 설명드리겠습니다.\n\n',
    '네, 알겠습니다. 다음과 같은 방법을 추천드립니다.\n\n',
  ];

  const baseIdx = Math.floor(rng() * responses.length);
  let response = responses[baseIdx];

  // 사용자 메시지 길이에 비례하는 응답 생성
  const sentences = [
    '이 접근 방식은 여러 장점이 있습니다.',
    '먼저 기본 개념부터 정리하면 좋을 것 같습니다.',
    '실제로 많이 사용되는 방법 중 하나입니다.',
    '구현 시 주의할 점도 있으니 참고해주세요.',
    '추가적인 질문이 있으시면 말씀해주세요.',
    '이렇게 하면 원하시는 결과를 얻을 수 있습니다.',
    '다른 방법도 고려해볼 수 있습니다.',
    '성능과 유지보수 측면에서 모두 좋은 선택입니다.',
  ];

  const sentenceCount = Math.min(3 + Math.floor(rng() * 5), 8);
  for (let i = 0; i < sentenceCount; i++) {
    const idx = Math.floor(rng() * sentences.length);
    response += sentences[idx] + ' ';
    if ((i + 1) % 3 === 0) response += '\n\n';
  }

  return response.trim();
}

/**
 * Shadow 응답 지연 시뮬레이션 (ms)
 * 실제 시스템과 유사한 지연을 추가하여 Shadow 탐지를 어렵게 함
 */
export function getSyntheticResponseDelay(seed: number): number {
  const rng = mulberry32(seed + Date.now());
  // 200ms ~ 2000ms 사이의 plausible 지연
  return Math.floor(200 + rng() * 1800);
}
