export type PriceTier = 'low' | 'mid' | 'high';

export interface TokenBudget {
  input: number;  // 입력 토큰 예산
  output: number; // 출력 토큰 예산
}

export interface AIModel {
  id: string;
  series: 'gpt' | 'claude' | 'perplexity' | 'coding' | 'image' | 'gemini' | 'video' | 'grok';
  displayName: string;
  piWon: number | null; // 원가 (원), null은 미정
  enabled: boolean;
  description?: string;
  tier: PriceTier; // 가격대 (low/mid/high)
  maxCharacters: number; // 최대 입력 글자 수
  tokenBudget?: TokenBudget; // 토큰 예산 (1회 기준)
  pricePerSecond?: number; // 영상 모델: 1초당 가격 (원)
  isBatch?: boolean; // 48h 지연 응답 모델
  baseModelId?: string; // 48h 모델의 원본 모델 ID
}

export interface ModelSelection {
  modelId: string;
  quantity: number; // 월 사용 횟수
}

export interface PricingPolicy {
  margin: number; // 1.2 고정
  minTotalWon: number; // 100원
  rounding: 'nearest10';
  countDiscount: {
    [key: string]: number;
  };
  seriesBonus: Array<{
    minAvg: number;
    maxAvg: number;
    bonus: number;
  }>;
  seriesCap: number; // 0.30
}

export interface PriceCalculation {
  subtotal: number; // 원가 합계 (기준가격 S)
  subtotalWithMargin: number; // 마진 적용 후
  discountType: 'individual' | 'series'; // 적용된 할인 타입
  headlineDiscountRate: number; // 헤드라인 할인율 (유저에게 보여주는 할인)
  effectiveDiscountRate: number; // 실제 적용된 가중 할인율
  discountRate: number; // 적용된 할인율 (effectiveDiscountRate와 동일, 하위 호환용)
  discountAmount: number; // 할인 금액
  totalBeforeRounding: number; // 반올림 전 총액
  totalAfterRounding: number; // 반올림 후
  finalTotal: number; // 최소 금액 규칙 적용 후 최종 금액
  selectedModelsCount: number; // 선택된 모델 개수
  isSeriesBundle: boolean; // 시리즈 전체 선택 여부
  coinReward?: number; // 지급될 코인 (PMC)
}

export interface UserWallet {
  userId: string;
  credits: {
    [modelId: string]: number; // 모델별 잔여 횟수
  };
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'purchase' | 'usage';
  modelId?: string;
  amount?: number; // purchase일 때 결제 금액
  credits?: { [modelId: string]: number }; // purchase일 때 구매한 크레딧
  timestamp: Date;
  description?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelId?: string; // 사용된 모델 ID
  timestamp: string | Date;
  creditUsed?: number | boolean; // 크레딧 차감 여부 또는 사용량
  createdAt?: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  isStarred?: boolean;
}

export type ThemeColor = 'gray' | 'red' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow';

// 다크모드 관련 타입
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeSettings {
  mode: ThemeMode;
  color: ThemeColor;
  customColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

// 모델 비교 관련 타입
export interface ComparisonSession {
  id: string;
  models: string[];
  prompt: string;
  responses: {
    [modelId: string]: {
      content: string;
      timestamp: Date;
      tokens: number;
      cost: number;
      latency: number;
    };
  };
  createdAt: Date;
}

// 대화 템플릿 관련 타입
export interface ChatTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  prompt: string;
  variables?: {
    name: string;
    type: 'text' | 'number' | 'select' | 'date';
    placeholder?: string;
    options?: string[];
    required?: boolean;
  }[];
  usage: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// 페르소나 관련 타입
export interface PersonaSettings {
  id: string;
  name: string;
  avatar?: string;
  personality: {
    tone: 'formal' | 'casual' | 'friendly' | 'professional' | 'humorous';
    language: 'polite' | 'casual' | 'technical';
    emotionLevel: number; // 0-10
    emojiUsage: boolean;
    responseLength: 'concise' | 'balanced' | 'detailed';
  };
  expertise: {
    domains: string[];
    level: 'beginner' | 'intermediate' | 'expert';
    specificKnowledge?: string[];
  };
  speechPatterns: {
    greetings?: string[];
    closings?: string[];
    catchPhrases?: string[];
    vocabularyLevel: 'simple' | 'moderate' | 'advanced';
  };
  memory: {
    rememberUser: boolean;
    contextLength: number;
    personalFacts?: { [key: string]: string };
  };
  growthSettings: {
    learningEnabled: boolean;
    adaptToUser: boolean;
    feedbackIntegration: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// 크레딧 선물 관련 타입
export interface CreditGift {
  id: string;
  from: string;
  to: string;
  credits: { [modelId: string]: number };
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  claimedAt?: Date;
}

// 사용량 알림 관련 타입
export interface UsageAlert {
  id: string;
  userId: string;
  type: 'low_credits' | 'usage_spike' | 'monthly_limit' | 'custom';
  threshold: number;
  modelId?: string;
  enabled: boolean;
  notificationChannels: ('email' | 'push' | 'in-app')[];
  lastTriggered?: Date;
  createdAt: Date;
}

// 자동 충전 관련 타입
export interface AutoRechargeSettings {
  enabled: boolean;
  threshold: number; // 크레딧이 이 수준 이하로 떨어지면 자동 충전
  amount: number; // 충전할 금액
  maxMonthlyAmount: number; // 월 최대 자동 충전 금액
  paymentMethod?: string;
  lastRecharge?: Date;
  monthlyUsage: number;
}

// 자동 삭제 관련 타입
export interface AutoDeleteSettings {
  enabled: boolean;
  deleteAfterDays: number;
  excludeStarred: boolean;
  excludeTemplates: boolean;
  lastCleanup?: Date;
}

// 스트리밍 개선 관련 타입
export interface StreamingSettings {
  enabled: boolean;
  bufferSize: number;
  chunkDelay: number; // ms
  showTypingIndicator: boolean;
  smoothScrolling: boolean;
  errorRecovery: boolean;
}

// 성장형 AI 관련 타입
export interface AIGrowthData {
  userId: string;
  modelPreferences: {
    [modelId: string]: {
      satisfactionScore: number;
      usageCount: number;
      averageResponseTime: number;
      preferredForTasks: string[];
    };
  };
  learningHistory: {
    date: Date;
    interaction: string;
    feedback: 'positive' | 'negative' | 'neutral';
    improvement?: string;
  }[];
  personalizedSettings: {
    preferredResponseLength: number;
    technicalLevel: number;
    creativityLevel: number;
    formalityLevel: number;
  };
  interests: string[];
  frequentTopics: string[];
}

// 전문 분야 설정 타입
export interface ExpertiseProfile {
  id: string;
  name: string;
  domains: {
    primary: string;
    secondary: string[];
  };
  certifications?: string[];
  experience: 'novice' | 'intermediate' | 'advanced' | 'expert';
  specializations: string[];
  customKnowledge: {
    facts: string[];
    rules: string[];
    examples: string[];
  };
  language: {
    technical: boolean;
    jargon: string[];
    acronyms: { [key: string]: string };
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  credits?: number;
  subscription?: string;
  theme?: ThemeColor;
  createdAt: Date;
  updatedAt?: Date;
}

// Feedback
export type FeedbackType = 'question' | 'suggestion' | 'bug' | 'roast';
export type FeedbackStatus = 'open' | 'resolved';

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  title: string;
  content: string;
  screenshots?: string[]; // data URLs
  status: FeedbackStatus;
  reply?: string;
  repliedAt?: Date;
  createdBy: { userId: string; email: string; name?: string };
  createdAt: Date;
}

// PMC (Pick-My-Coin) 관련 타입
export type UserPlan = 'free' | 'plus' | 'pro' | 'max';

export interface PMCBalance {
  amount: number; // 보유 PMC (1 PMC = 1원)
  history: PMCTransaction[];
}

export interface PMCTransaction {
  id: string;
  type: 'earn' | 'use' | 'expire';
  amount: number;
  description: string;
  orderId?: string;
  expiresAt: Date; // 90일 유효기간
  createdAt: Date;
}

export interface PMCCalculation {
  baseRate: number; // 기본 적립률 (총 선택 수량 기반)
  planBonusRate: number; // 플랜 추가 적립률
  totalRate: number; // 총 적립률
  earnAmount: number; // 적립될 PMC 금액
  maxUsable: number; // 사용 가능한 최대 PMC (결제금액의 30%)
}

// 북마크 메시지 타입
export interface BookmarkedMessage {
  id: string;
  sessionId: string;
  content: string;
  modelId?: string;
  timestamp: string;
  sessionTitle?: string;
}

// Poll (투표) 관련 타입
export type PollStatus = 'active' | 'closed' | 'expired';

export interface PollVote {
  userId: string;
  vote: 'agree' | 'disagree';
  votedAt: Date;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  status: PollStatus;
  createdBy: string; // 관리자 이메일
  createdAt: Date;
  expiresAt: Date; // 생성일로부터 1달
  votes: PollVote[];
  agreeCount: number;
  disagreeCount: number;
}
