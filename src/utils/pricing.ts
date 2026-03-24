import { AIModel, ModelSelection, PricingPolicy, PriceCalculation, PriceTier, UserPlan, PMCCalculation, TokenBudget } from '@/types';

// 모델 가중치 (α) 매핑
const modelWeights: Record<PriceTier, number> = {
  'low': 1.0,   // 저가 모델
  'mid': 0.7,   // 중간 가격대 모델
  'high': 0.3   // 고가 모델
};

// 모델별 할인 상한 (c_i) - 모든 티어 30% 통일
const discountCaps: Record<PriceTier, number> = {
  'low': 0.30,   // 저가 모델 최대 30%
  'mid': 0.30,   // 중간 가격대 모델 최대 30%
  'high': 0.30   // 고가 모델 최대 30% (Opus 등 역마진 방지는 적립률로 제어)
};

// 플랜별 코인 지급 계수 (β)
const planCoinMultipliers: Record<string, number> = {
  'plus': 0.6,
  'pro': 0.7,
  'max': 0.8
};

// 기본 정책 설정
export const defaultPolicy: PricingPolicy = {
  margin: 1.119, // 11.9% 수수료
  minTotalWon: 100,
  rounding: 'nearest10',
  // 기존 할인 정책은 더 이상 사용하지 않음
  countDiscount: {},
  seriesBonus: [],
  seriesCap: 0.30, // 최대 할인율 30% 유지
};

// 소숫점 첫째자리에서 반올림
export function roundToNearest10(amount: number): number {
  return Math.round(amount);
}

// 표시용 가격 계산 (기본 가격 * 마진 → 10원 단위 반올림)
export function getDisplayPrice(piWon: number, margin: number = 1.2): number {
  return roundToNearest10(piWon * margin);
}

// 모델의 가중치(α) 가져오기
function getModelWeight(tier: PriceTier): number {
  return modelWeights[tier] || 1.0;
}

// Step 2: 헤드라인 할인율 계산 (유저에게 보여주는 할인)
function calculateHeadlineDiscount(modelCount: number): number {
  if (modelCount <= 1) return 0;
  return Math.min(0.05 * (modelCount - 1), 0.30);
}

// Step 3: 가중 할인율 계산 (실제로 적용될 할인)
function calculateEffectiveDiscount(
  models: AIModel[],
  selections: ModelSelection[],
  headlineDiscount: number,
  subtotal: number
): number {
  if (headlineDiscount === 0 || subtotal === 0) return 0;
  
  let weightedDiscountSum = 0;
  
  selections.forEach((sel) => {
    const model = models.find((m) => m.id === sel.modelId);
    if (!model) return;
    
    const priceData = getFixedDisplayPriceOrFallback(model.id, model.piWon);
    const tier = priceData.tier;
    const alpha = modelWeights[tier] || 1.0;
    const cap = discountCaps[tier] || 0.30;
    
    // d_i = min(D_head * α_i, c_i)
    const modelDiscount = Math.min(headlineDiscount * alpha, cap);
    
    // w_i = (p_i * q_i) / S
    const modelSubtotal = priceData.price * sel.quantity;
    const weight = modelSubtotal / subtotal;
    
    // 가중 할인 누적
    weightedDiscountSum += weight * modelDiscount;
  });
  
  return weightedDiscountSum;
}

// Step 6: 코인 지급 계산
function calculateCoinReward(
  headlineDiscount: number,
  effectiveDiscount: number,
  subtotal: number,
  userPlan: string = 'plus'
): number {
  const delta = Math.max(0, headlineDiscount - effectiveDiscount);
  const beta = planCoinMultipliers[userPlan.toLowerCase()] || 0.6;
  return Math.round(delta * subtotal * beta);
}

// 가격 계산 메인 함수
export function calculatePrice(
  models: AIModel[],
  selections: ModelSelection[],
  policy: PricingPolicy = defaultPolicy,
  isFirstPurchase: boolean = false
): PriceCalculation {
  // 유효한 선택만 필터링
  const validSelections = selections.filter((sel) => sel.quantity > 0);

  if (validSelections.length === 0) {
    return {
      subtotal: 0,
      subtotalWithMargin: 0,
      discountType: 'individual',
      headlineDiscountRate: 0,
      effectiveDiscountRate: 0,
      discountRate: 0,
      discountAmount: 0,
      totalBeforeRounding: 0,
      totalAfterRounding: 0,
      finalTotal: policy.minTotalWon,
      selectedModelsCount: 0,
      isSeriesBundle: false,
      coinReward: 0,
    };
  }

  // 기준가격 계산 (S = Σ p_i * q_i)
  let subtotal = 0;
  validSelections.forEach((sel) => {
    const model = models.find((m) => m.id === sel.modelId);
    if (model) {
      const priceData = getFixedDisplayPriceOrFallback(model.id, model.piWon);
      // 모델에 티어 정보가 없으면 여기서 설정
      if (!model.tier) {
        model.tier = priceData.tier;
      }
      subtotal += priceData.price * sel.quantity;
    }
  });

  // 마진 적용 (표시용)
  const subtotalWithMargin = subtotal * policy.margin;

  // 할인 없음 - 총 결제 금액 = 상품 금액
  let discountAmount = 0;
  let discountRate = 0;

  // 할인 적용 후 금액 (할인 없으므로 동일)
  const totalBeforeRounding = subtotalWithMargin - discountAmount;

  // 반올림
  const totalAfterRounding = roundToNearest10(totalBeforeRounding);

  // 최소 금액 규칙 적용
  const finalTotal = Math.max(policy.minTotalWon, totalAfterRounding);

  return {
    subtotal,
    subtotalWithMargin,
    discountType: 'individual',
    headlineDiscountRate: 0,
    effectiveDiscountRate: 0,
    discountRate: 0,
    discountAmount: 0,
    totalBeforeRounding,
    totalAfterRounding,
    finalTotal,
    selectedModelsCount: validSelections.length,
    isSeriesBundle: false,
    coinReward: 0,
  };
}

// 포맷 유틸리티
export function formatWon(amount: number): string {
  // 소수점 아래 숫자가 있는 경우에만 반올림
  const rounded = amount % 1 === 0 ? amount : Math.round(amount * 100) / 100;
  return rounded.toLocaleString('ko-KR') + '원';
}

export function formatPercent(rate: number): string {
  return (rate * 100).toFixed(0) + '%';
}

// 모델 데이터 (가격 및 티어 정보)
interface ModelData {
  price: number;
  tier: PriceTier;
}

// 모델별 토큰 예산 (1회 기준) - 흑자 전환 황금 밸런스
const tokenBudgets: Record<string, TokenBudget> = {
  // GPT 계열 (500 In / 500 Out - 짧고 굵은 답변)
  'gpt5': { input: 500, output: 500 },
  'gpt51': { input: 500, output: 500 },
  'gpt52': { input: 500, output: 500 },
  'gpt4o': { input: 500, output: 500 },
  'gpt41': { input: 500, output: 500 },
  'o3': { input: 500, output: 500 },
  'o3mini': { input: 500, output: 500 },
  'o4mini': { input: 500, output: 500 },
  // Claude 계열 (1000 In / 1000 Out - "혜자" 마케팅 포인트)
  'haiku35': { input: 1000, output: 1000 },
  'haiku45': { input: 1000, output: 1000 },
  'sonnet45': { input: 1000, output: 1000 },
  'sonnet46': { input: 1000, output: 1000 },
  'opus4': { input: 1000, output: 1000 },
  'opus41': { input: 1000, output: 1000 },
  'opus45': { input: 1000, output: 1000 },
  'opus46': { input: 1000, output: 1000 },
  // Gemini 계열 (500 In / 500 Out)
  'gemini3': { input: 500, output: 500 },
  'gemini3pro': { input: 500, output: 500 },
  // Perplexity 계열 (300 In / 300 Out - 검색 전용)
  'sonar': { input: 300, output: 300 },
  'sonarPro': { input: 300, output: 300 },
  'deepResearch': { input: 300, output: 300 },
  // Coding (500 In / 500 Out)
  'codex': { input: 500, output: 500 },
  'gpt5codex': { input: 500, output: 500 },
  'gpt51codex': { input: 500, output: 500 },
  'gpt51codexmax': { input: 500, output: 500 },
  'gpt52codex': { input: 500, output: 500 },
  // Image (500 In / 500 Out)
  'gptimage1': { input: 500, output: 500 },
};

// 모델별 고정 가격 및 티어 정보 (확정 판매가, 단위: 원)
const modelData: Record<string, ModelData> = {
  // GPT 계열 - 주력 모델
  'gpt5': { price: 10, tier: 'low' },        // 순이익 +0.92원
  'gpt51': { price: 11, tier: 'low' },       // 안정적 마진
  'gpt52': { price: 14, tier: 'low' },
  'gpt53instant': { price: 30, tier: 'mid' },
  'gpt54': { price: 45, tier: 'mid' },
  'gpt4o': { price: 10, tier: 'mid' },       // 순이익 +0.92원
  'gpt41': { price: 8, tier: 'low' },
  'o3': { price: 8, tier: 'low' },
  'o3mini': { price: 5, tier: 'low' },
  'o4mini': { price: 2, tier: 'low' },
  // Claude 계열 - PMI 2026 안정 가격표
  'haiku35': { price: 5, tier: 'low' },      // 원가 2.25원 → 5원
  'sonnet35': { price: 30, tier: 'mid' },
  'haiku45': { price: 15, tier: 'mid' },     // 원가 9원 → 15원
  'sonnet45': { price: 45, tier: 'mid' },    // 원가 27원 → 45원
  'sonnet46': { price: 45, tier: 'mid' },    // 원가 27원 → 45원
  'opus4': { price: 199, tier: 'high' },     // 원가 135원 → 199원
  'opus41': { price: 199, tier: 'high' },    // 원가 135원 → 199원
  'opus45': { price: 79, tier: 'high' },     // 원가 45원 → 79원
  'opus46': { price: 79, tier: 'high' },     // 원가 45원 → 79원
  // Gemini 계열
  'gemini3': { price: 8, tier: 'low' },
  'gemini3pro': { price: 35, tier: 'mid' },
  // Perplexity 계열 - 1원 판매 가능
  'sonar': { price: 1, tier: 'low' },        // 원가 0.84원 방어로 1원 판매 가능!
  'sonarPro': { price: 15, tier: 'mid' },
  'deepResearch': { price: 8, tier: 'mid' },
  // Coding
  'codex': { price: 12, tier: 'low' },
  'gpt5codex': { price: 12, tier: 'low' },
  'gpt51codex': { price: 12, tier: 'low' },
  'gpt51codexmax': { price: 12, tier: 'low' },
  'gpt52codex': { price: 15, tier: 'mid' },
  // Image
  'gptimage1': { price: 40, tier: 'mid' },
  // 48h 배치 모델
  'gpt5_48h': { price: 5, tier: 'low' },
  'gpt51_48h': { price: 6, tier: 'low' },
  'gpt52_48h': { price: 7, tier: 'low' },
  'gpt53instant_48h': { price: 15, tier: 'mid' },
  'gpt54_48h': { price: 23, tier: 'mid' },
  'gpt4o_48h': { price: 5, tier: 'mid' },
  'gpt41_48h': { price: 4, tier: 'low' },
  'o3_48h': { price: 4, tier: 'low' },
  'o4mini_48h': { price: 1, tier: 'low' },
  'haiku35_48h': { price: 3, tier: 'low' },
  'sonnet35_48h': { price: 15, tier: 'mid' },
  'haiku45_48h': { price: 8, tier: 'mid' },
  'sonnet45_48h': { price: 23, tier: 'mid' },
  'sonnet46_48h': { price: 23, tier: 'mid' },
  'opus45_48h': { price: 40, tier: 'high' },
  'opus46_48h': { price: 40, tier: 'high' },
  'opus4_48h': { price: 100, tier: 'high' },
  // Alias 호환
  'claude_opus_41': { price: 75, tier: 'high' },
};

// 이전 버전과의 호환성을 위한 가격 매핑
const fixedDisplayPriceWon: Record<string, number> = Object.entries(modelData).reduce((acc, [key, data]) => {
  acc[key] = data.price;
  return acc;
}, {} as Record<string, number>);

// 모델 ID를 받아 고정 표시가(원)와 티어 정보를 반환
export function getFixedDisplayPriceOrFallback(modelId: string, piWon: number): { price: number; tier: PriceTier } {
  const data = modelData[modelId];
  if (data) {
    return { price: data.price, tier: data.tier };
  }
  return { 
    price: getDisplayPrice(piWon),
    tier: 'low' // 기본값은 low로 설정
  };
}

// ==================== PMC (Pick-My-Coin) 시스템 ====================

// 플랜별 추가 적립률
const planBonusRates: Record<UserPlan, number> = {
  'free': 0.00,  // +0%
  'plus': 0.02,  // +2%
  'pro': 0.05,   // +5%
  'max': 0.07,   // +7%
};

// 수수료율 (마진 - 1.0)
const FEE_RATE = 0.119; // 11.9%

// 고가 모델 적립률 상한 (티어별) - 수수료율 이하로 제한
const tierMaxRates: Record<PriceTier, number> = {
  'low': 0.10,   // 저가 모델: 최대 10%
  'mid': 0.10,   // 중간가 모델: 최대 10%
  'high': 0.05,  // 고가 모델(Opus 등): 최대 5% (역마진 방지)
};

// PMC 사용 한도 (결제 금액의 30%)
const PMC_USE_LIMIT_RATE = 0.30;

// PMC 1회 최대 사용 금액 (10,000원)
const PMC_MAX_USE_AMOUNT = 10000;

// PMC 유효기간 (90일)
export const PMC_EXPIRY_DAYS = 90;

/**
 * PMC 기본 적립률 계산 (총 선택 수량 기반)
 * 핵심: 여러 모델을 섞어 담을수록 적립률 상승
 * 
 * 공식: min(3% × (총 선택 수량 - 1), 10%)
 * 
 * 예시:
 * - 총 1개: 0%
 * - 총 2개: 3%
 * - 총 3개: 6%
 * - 총 4개: 9%
 * - 총 5개 이상: 10% (캡)
 */
export function calculateBaseEarnRate(totalSelectedQuantity: number): number {
  if (totalSelectedQuantity <= 1) return 0;
  return Math.min(0.03 * (totalSelectedQuantity - 1), 0.10);
}

/**
 * 플랜별 추가 적립률 반환
 */
export function getPlanBonusRate(plan: UserPlan): number {
  return planBonusRates[plan] || 0;
}

/**
 * PMC 적립 계산 메인 함수
 * 
 * 핵심 공식:
 * 1. 기본 적립률 R_base = min(3% × (총 선택 수량 - 1), 10%)
 * 2. 플랜 보너스 R_plan (Free: 0%, Plus: 2%, Pro: 5%, Max: 7%)
 * 3. 헤드라인 적립률은 수수료율(11.9%)을 초과 불가
 * 4. 모델별 가중 적립률 계산 (고가 모델은 티어별 상한 적용)
 *    - low/mid: 최대 10%
 *    - high(Opus 등): 최대 5% (역마진 방지)
 * 5. 최종 PMC = Σ(모델별 결제금액 × 해당 모델 적립률)
 * 
 * 예시:
 * - GPT-4o 10원 × 1개 + Sonnet 4.5 20원 × 1개 = 30원 결제
 * - 총 2개 → 기본 3% + Plus 2% = 5%
 * - GPT-4o: 10원 × 5% = 0.5 PMC
 * - Sonnet 4.5: 20원 × 5% = 1.0 PMC
 * - 합계: 1.5 PMC → 1 PMC (소수점 버림)
 */
export function calculatePMCEarn(
  models: AIModel[],
  selections: ModelSelection[],
  paymentAmount: number,
  userPlan: UserPlan = 'free'
): PMCCalculation {
  // 유효한 선택만 필터링
  const validSelections = selections.filter((sel) => sel.quantity > 0);
  const totalSelectedQuantity = validSelections.reduce((sum, sel) => sum + sel.quantity, 0);
  
  // Step 1: 기본 적립률 (총 선택 수량 기반)
  const baseRate = calculateBaseEarnRate(totalSelectedQuantity);
  
  // Step 2: 플랜 보너스
  const planBonusRate = getPlanBonusRate(userPlan);
  
  // Step 3: 헤드라인 적립률 (유저에게 보여주는 적립률)
  // 수수료율(11.9%)을 초과하지 않도록 제한
  const headlineRate = Math.min(baseRate + planBonusRate, FEE_RATE);
  
  // Step 4: 모델별 가중 적립 계산
  let totalEarnPMC = 0;
  
  validSelections.forEach((sel) => {
    const model = models.find((m) => m.id === sel.modelId);
    if (!model) return;
    
    const priceData = getFixedDisplayPriceOrFallback(model.id, model.piWon);
    const tier = priceData.tier;
    const modelPrice = priceData.price * sel.quantity;
    
    // 티어별 적립률 상한 적용
    const tierCap = tierMaxRates[tier] || 0.30;
    const effectiveRate = Math.min(headlineRate, tierCap);
    
    // 모델별 적립 PMC
    const modelEarnPMC = modelPrice * effectiveRate;
    totalEarnPMC += modelEarnPMC;
  });
  
  // Step 5: 최종 적립 PMC (소수점 버림)
  const earnAmount = Math.floor(totalEarnPMC);
  
  // 사용 가능한 최대 PMC (결제금액의 30% 또는 10,000원 중 작은 값)
  const maxUsable = Math.min(
    Math.floor(paymentAmount * PMC_USE_LIMIT_RATE),
    PMC_MAX_USE_AMOUNT
  );
  
  return {
    baseRate,
    planBonusRate,
    totalRate: headlineRate,
    earnAmount,
    maxUsable,
  };
}

/**
 * PMC 만료일 계산
 */
export function getPMCExpiryDate(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + PMC_EXPIRY_DAYS);
  return expiry;
}

/**
 * 모델별 토큰 예산 가져오기
 */
export function getTokenBudget(modelId: string): TokenBudget {
  return tokenBudgets[modelId] || { input: 500, output: 500 }; // 기본값
}

