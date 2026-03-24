const CSRF_TOKEN_STORAGE_KEY = 'pick-my-ai-csrf-token';

let memoryCsrfToken: string | null = null;
let inflightCsrfTokenPromise: Promise<string> | null = null;

function getCachedCsrfToken(): string | null {
  if (memoryCsrfToken) return memoryCsrfToken;
  if (typeof window === 'undefined') return null;

  try {
    const token = window.sessionStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
    if (token) memoryCsrfToken = token;
    return token;
  } catch {
    return null;
  }
}

function setCachedCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
  if (typeof window === 'undefined') return;

  try {
    if (!token) {
      window.sessionStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(CSRF_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/csrf', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`CSRF 토큰 요청 실패 (상태 코드: ${response.status})`);
  }

  const data = (await response.json()) as { csrfToken?: string };
  if (!data?.csrfToken) {
    throw new Error('CSRF 토큰 응답이 올바르지 않습니다.');
  }

  return data.csrfToken;
}

async function getOrFetchCsrfToken(): Promise<string> {
  const cached = getCachedCsrfToken();
  if (cached) return cached;

  if (inflightCsrfTokenPromise) {
    return inflightCsrfTokenPromise;
  }

  inflightCsrfTokenPromise = (async () => {
    const token = await fetchCsrfToken();
    setCachedCsrfToken(token);
    return token;
  })();

  try {
    return await inflightCsrfTokenPromise;
  } finally {
    inflightCsrfTokenPromise = null;
  }
}

function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (!isStateChangingMethod(method)) {
    return fetch(input, init);
  }

  const requestWithToken = async (csrfToken: string): Promise<Response> => {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-csrf-token', csrfToken);

    return fetch(input, {
      ...init,
      headers,
    });
  };

  const token = await getOrFetchCsrfToken();
  const first = await requestWithToken(token);

  if (first.status !== 403) {
    return first;
  }

  // 403 응답 body를 소비하여 HTTP 연결 및 메모리 해제
  try { await first.body?.cancel(); } catch {}

  // 403일 때 1회만 토큰을 갱신 후 재시도
  const refreshed = await fetchCsrfToken();
  setCachedCsrfToken(refreshed);

  return requestWithToken(refreshed);
}
