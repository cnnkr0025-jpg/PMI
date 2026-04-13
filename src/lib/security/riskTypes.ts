/**
 * PickMyAI Production-Grade Multi-Dimensional Risk Engine — Types
 *
 * 6 리스크 스코프 × 5 카테고리 기반 다차원 모델.
 * 모든 보안 계층(Layer 1-21)은 이 타입을 통해 리스크 엔진에 신호를 보고한다.
 */

// ── 리스크 스코프 (어디에서 이상이 발생했는가) ──
export type RiskScope =
  | 'request_risk'
  | 'session_risk'
  | 'device_risk'
  | 'ip_risk'
  | 'account_risk'
  | 'asset_integrity_risk';

// ── 리스크 카테고리 (어떤 종류의 이상인가) ──
export type RiskCategory =
  | 'exploit_intent'
  | 'automation'
  | 'client_integrity'
  | 'session_integrity'
  | 'asset_integrity';

// ── 신호 강도 ──
export type SignalStrength = 'soft' | 'medium' | 'hard';

// ── 개별 리스크 신호 ──
export interface RiskSignal {
  /** 어느 Layer에서 발생했는가 (L1 ~ L21) */
  layer: number;
  /** 신호 식별자 (예: 'PATH_TRAVERSAL', 'HONEYPOT_HIT') */
  type: string;
  /** 부여 점수 */
  score: number;
  /** 대상 스코프 */
  scope: RiskScope;
  /** 대상 카테고리 */
  category: RiskCategory;
  /** 신호 강도 */
  strength: SignalStrength;
  /** 같은 family 내 중복 방지용 family 키 */
  family?: string;
  /** 디버그/감사용 상세 설명 */
  detail?: string;
  /** 이 신호의 TTL (ms). 없으면 스코프별 기본값 사용 */
  ttlMs?: number;
}

// ── 엔진 판단 결과 ──
export type RiskDecision = 'allow' | 'observe' | 'challenge' | 'shadow' | 'vault';

export interface RiskDecisionResult {
  /** 총 합산 점수 (모든 스코프 합) */
  totalScore: number;
  /** 스코프별 점수 */
  scopeScores: Record<RiskScope, number>;
  /** 현재 활성 신호 목록 */
  activeSignals: RiskSignal[];
  /** 최종 판단 */
  decision: RiskDecision;
  /** 판단 근거 (감사 로그용) */
  decisionReason: string;
  /** Shadow 전환 조건 충족 여부 세부 */
  shadowQualification: ShadowQualification;
}

export interface ShadowQualification {
  /** 90점 이상 여부 */
  scoreThresholdMet: boolean;
  /** 강한 신호 1개 이상 존재 여부 */
  hasHardSignal: boolean;
  /** 중간 신호 2개 이상 + 서로 다른 카테고리 */
  hasCrossCategoryMedium: boolean;
  /** Challenge 실패 + 추가 이상 누적 */
  challengeFailedWithAccumulation: boolean;
  /** 최종 Shadow 전환 가능 여부 */
  qualified: boolean;
}

// ── 리스크 컨텍스트 (요청/세션 단위로 전달) ──
export interface RiskContext {
  /** 클라이언트 IP */
  ip: string;
  /** User-Agent */
  userAgent: string;
  /** 인증된 사용자 ID (없으면 익명) */
  userId?: string;
  /** 세션 ID */
  sessionId?: string;
  /** 디바이스 해시 (브라우저 핑거프린트) */
  deviceHash?: string;
  /** 요청 경로 */
  pathname: string;
  /** 요청 메서드 */
  method: string;
  /** 인증 여부 */
  isAuthenticated: boolean;
}

// ── 스코프별 기본 TTL (ms) ──
export const SCOPE_DEFAULT_TTL: Record<RiskScope, number> = {
  request_risk: 0,                           // 요청 종료 시 만료
  session_risk: 30 * 60 * 1000,              // 30분
  device_risk: 24 * 60 * 60 * 1000,          // 24시간
  ip_risk: 6 * 60 * 60 * 1000,              // 6시간
  account_risk: 24 * 60 * 60 * 1000,         // 24시간
  asset_integrity_risk: Infinity,             // 수동 해제 전까지 유지
};

// ── 판단 임계치 ──
export const THRESHOLDS = {
  OBSERVE: 25,
  CHALLENGE: 50,
  SHADOW: 90,
} as const;

// ── Family Cap 제한 (같은 family 신호의 최대 합산 점수) ──
export const FAMILY_CAPS: Record<string, number> = {
  automation_burst: 30,   // Layer 5 + 7 + 12
  ip_context: 20,         // Layer 13
  client_token: 30,       // Layer 11 + 14
};

// ── 하위 호환용 Legacy 타입 ──
export type LegacyRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type LegacyRiskAction = 'allow' | 'stepUp' | 'tempBlock' | 'criticalBlock';

export interface LegacyRiskResult {
  score: number;
  level: LegacyRiskLevel;
  signals: Array<{ type: string; score: number; detail?: string }>;
  action: LegacyRiskAction;
}
