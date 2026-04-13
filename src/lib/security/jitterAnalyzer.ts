/**
 * PickMyAI Jitter & Behavior Rhythm Analysis — Layer 18
 *
 * 완벽히 일정한 요청 간격, UI 없는 호출 패턴, 비인간적 cadence 탐지.
 *
 * 점수: automation +5
 * 단독 판정 금지 — Layer 4/5/17과 결합 시에만 의미 강화.
 */

interface TimingRecord {
  timestamps: number[];
  lastChecked: number;
}

const timingStore = new Map<string, TimingRecord>();
const TIMING_STORE_MAX = 50_000;
const TIMING_WINDOW_MS = 60_000; // 1분
const MIN_SAMPLES = 5; // 최소 5개 요청이 있어야 분석

/**
 * 요청 타이밍 기록
 */
export function recordRequestTiming(key: string): void {
  const now = Date.now();
  let record = timingStore.get(key);

  if (!record) {
    if (timingStore.size >= TIMING_STORE_MAX) {
      const fk = timingStore.keys().next().value;
      if (fk !== undefined) timingStore.delete(fk);
    }
    record = { timestamps: [], lastChecked: now };
    timingStore.set(key, record);
  }

  // 윈도우 외 타이밍 정리
  record.timestamps = record.timestamps.filter(t => now - t < TIMING_WINDOW_MS);
  record.timestamps.push(now);
}

export interface JitterAnalysisResult {
  /** 봇 의심 여부 */
  suspicious: boolean;
  /** 평균 간격 (ms) */
  avgInterval: number;
  /** 간격의 표준편차 (ms) */
  stdDeviation: number;
  /** 변동 계수 (CV) — 낮을수록 봇 의심 */
  coefficientOfVariation: number;
  /** 분석된 샘플 수 */
  sampleCount: number;
}

/**
 * 지터 분석
 *
 * 변동 계수(CV) < 0.05 이면 "거의 완벽히 일정한 간격" → 봇 의심.
 * 인간의 자연스러운 클릭은 보통 CV > 0.15.
 */
export function analyzeJitter(key: string): JitterAnalysisResult {
  const record = timingStore.get(key);
  if (!record || record.timestamps.length < MIN_SAMPLES) {
    return {
      suspicious: false,
      avgInterval: 0,
      stdDeviation: 0,
      coefficientOfVariation: 1, // 데이터 부족 시 정상으로 간주
      sampleCount: record?.timestamps.length || 0,
    };
  }

  const sorted = [...record.timestamps].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 1;

  // CV < 0.05 = 봇 의심 (거의 완벽히 일정한 간격)
  const suspicious = cv < 0.05 && intervals.length >= MIN_SAMPLES;

  record.lastChecked = Date.now();

  return {
    suspicious,
    avgInterval: Math.round(avg),
    stdDeviation: Math.round(stdDev),
    coefficientOfVariation: Math.round(cv * 1000) / 1000,
    sampleCount: sorted.length,
  };
}

// 주기적 정리
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__jitterCleanup === 'undefined') {
  (globalThis as any).__jitterCleanup = true;
  setInterval(() => {
    const cutoff = Date.now() - TIMING_WINDOW_MS * 2;
    for (const [key, record] of timingStore) {
      if (record.lastChecked < cutoff) timingStore.delete(key);
    }
  }, 60_000);
}
