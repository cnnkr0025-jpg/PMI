/**
 * 사용자 데이터 Supabase 동기화 유틸리티
 * - 로그인 시 서버에서 데이터 로드
 * - 설정 변경 시 debounced로 서버에 저장
 */

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 로그인 시 서버에서 사용자 데이터(지갑, 설정) 로드
 */
export async function loadUserData(): Promise<{
  credits: Record<string, number>;
  settings: Record<string, any> | null;
} | null> {
  try {
    const res = await fetch('/api/user-data', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      credits: data.credits || {},
      settings: data.settings || null,
    };
  } catch {
    return null;
  }
}

/**
 * 사용자 설정을 서버에 저장 (debounced, 2초)
 */
export function saveUserSettings(settings: Record<string, any>): void {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/user-data', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
    } catch {
      // 저장 실패 시 무시 (로컬 스토리지에 이미 저장됨)
    }
  }, 2000);
}

/**
 * 현재 store 상태에서 서버에 저장할 설정 데이터를 추출
 */
export function extractSettingsFromState(state: any): Record<string, any> {
  return {
    selections: state.selections || [],
    hasFirstPurchase: state.hasFirstPurchase || false,
    themeSettings: state.themeSettings || { mode: 'system', color: 'blue' },
    personas: state.personas || [],
    activePersona: state.activePersona || null,
    chatTemplates: state.chatTemplates || [],
    favoriteTemplates: state.favoriteTemplates || [],
    autoRecharge: state.autoRecharge || null,
    autoDelete: state.autoDelete || null,
    streaming: state.streaming || null,
    aiGrowthData: state.aiGrowthData || null,
    expertiseProfiles: state.expertiseProfiles || [],
    activeExpertise: state.activeExpertise || null,
    // pmcBalance·userPlan은 서버에서만 관리 (클라이언트 조작 방지)
    // pmcBalance는 결제 confirm 서버에서만, userPlan은 관리자 경로에서만 변경
    storedFacts: state.storedFacts || [],
    usageAlerts: state.usageAlerts || [],
    notifications: state.notifications || [],
    comparisonSessions: state.comparisonSessions || [],
    customDesignTheme: state.customDesignTheme || null,
    settings: state.settings || null,
    language: state.language || 'ko',
  };
}
