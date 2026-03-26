/**
 * 극한 보안 강화 모듈
 * - 프로토타입 오염(Prototype Pollution) 방지
 * - SQL/NoSQL 인젝션 패턴 탐지
 * - 허니팟 경로 탐지 (공격자 자동 차단)
 * - 요청 무결성 검증
 * - 페이로드 크기 제한
 * - 의심스러운 패턴 탐지
 */

// ── 프로토타입 오염 방지 ──

const BANNED_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * JSON 객체에서 프로토타입 오염 키를 재귀적으로 제거
 */
export function sanitizeJsonDeep(obj: unknown, depth = 0): unknown {
  if (depth > 20) return undefined; // 재귀 폭탄 방지
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeJsonDeep(item, depth + 1));
  }

  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (BANNED_KEYS.has(key)) continue; // 오염 키 제거
    clean[key] = sanitizeJsonDeep((obj as Record<string, unknown>)[key], depth + 1);
  }
  return clean;
}

// ── 인젝션 패턴 탐지 ──

const INJECTION_PATTERNS = [
  // SQL Injection
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/i,
  /(';\s*--)/,
  /(;\s*DROP\s)/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  // NoSQL Injection
  /\$(?:gt|gte|lt|lte|ne|eq|regex|where|exists|type|in|nin|and|or|not|nor)\b/,
  // LDAP Injection
  /[()\\*|&]/,
  // Path traversal
  /\.\.[/\\]/,
  // Script injection (XSS)
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(?:error|load|click|mouse|focus|blur)\s*=/i,
  // Template injection
  /\{\{.*\}\}/,
  /\$\{.*\}/,
];

/**
 * 문자열에 인젝션 패턴이 있는지 검사
 */
export function containsInjectionPattern(input: string): boolean {
  if (typeof input !== 'string') return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * 사용자 입력 문자열을 안전하게 정화
 */
export function deepSanitizeString(input: string, maxLength = 10000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 제어 문자 제거
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // script 태그 제거
    .replace(/javascript\s*:/gi, '') // javascript: 프로토콜 제거
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // 이벤트 핸들러 제거
    .slice(0, maxLength);
}

// ── 허니팟 경로 (공격자 트랩) ──

const HONEYPOT_PATHS = new Set([
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.git',
  '/.git/config',
  '/.git/HEAD',
  '/.gitignore',
  '/.svn',
  '/.htaccess',
  '/.htpasswd',
  '/wp-admin',
  '/wp-login.php',
  '/wp-content',
  '/wp-includes',
  '/administrator',
  '/admin.php',
  '/phpmyadmin',
  '/phpinfo.php',
  '/server-status',
  '/server-info',
  '/cgi-bin',
  '/config.php',
  '/config.yml',
  '/config.json',
  '/database.yml',
  '/docker-compose.yml',
  '/Dockerfile',
  '/.aws/credentials',
  '/.ssh/id_rsa',
  '/etc/passwd',
  '/etc/shadow',
  '/proc/self/environ',
  '/actuator',
  '/actuator/health',
  '/graphql',
  '/debug',
  '/trace',
  '/console',
  '/xmlrpc.php',
  '/.well-known/security.txt',
  '/backup',
  '/backup.sql',
  '/dump.sql',
  '/db.sql',
  '/.DS_Store',
  '/web.config',
  '/robots.txt.bak',
  '/sitemap.xml.bak',
]);

// 허니팟 패턴 (정규식)
const HONEYPOT_PATTERNS = [
  /\/\.(env|git|svn|htaccess|htpasswd|aws|ssh|docker)/i,
  /\/(wp-|wordpress|joomla|drupal)/i,
  /\/(phpmyadmin|adminer|phpinfo)/i,
  /\/(backup|dump|export|db)\.(sql|zip|tar|gz|bak)/i,
  /\/(config|settings|credentials)\.(php|yml|yaml|json|xml|ini)/i,
  /\/api\/v[0-9]+\/(admin|debug|test|internal)/i,
  /\/__debug/i,
];

/**
 * 허니팟 경로 탐지 — 공격자가 스캐닝 시 즉시 IP 차단
 */
export function isHoneypotPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+/g, '/');
  if (HONEYPOT_PATHS.has(normalized)) return true;
  return HONEYPOT_PATTERNS.some((pattern) => pattern.test(normalized));
}

// ── 의심스러운 User-Agent 탐지 ──

const MALICIOUS_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /wpscan/i,
  /nuclei/i,
  /httpx/i,
  /ffuf/i,
  /feroxbuster/i,
  /burpsuite/i,
  /owasp/i,
  /acunetix/i,
  /nessus/i,
  /openvas/i,
  /w3af/i,
  /arachni/i,
  /havij/i,
  /metasploit/i,
  /hydra/i,
  /medusa/i,
  /^$/,  // 빈 User-Agent
];

/**
 * 공격 도구의 User-Agent 탐지
 */
export function isMaliciousUserAgent(ua: string | null): boolean {
  if (!ua) return true; // User-Agent 없으면 의심
  if (ua.length > 1000) return true; // 비정상적으로 긴 UA
  return MALICIOUS_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

// ── 요청 무결성 검증 ──

/**
 * API 요청 본문 크기 제한 확인
 */
export function isRequestBodyTooLarge(contentLength: string | null, maxBytes: number): boolean {
  if (!contentLength) return false;
  const size = parseInt(contentLength, 10);
  return Number.isFinite(size) && size > maxBytes;
}

/**
 * 요청 경로에 경로 순회(path traversal) 패턴이 있는지 검사
 */
export function hasPathTraversal(pathname: string): boolean {
  return /(\.\.[/\\]|%2e%2e[/\\%]|%252e%252e)/i.test(pathname);
}

/**
 * 요청 경로에 널 바이트가 있는지 검사 (null byte injection)
 */
export function hasNullByte(input: string): boolean {
  return input.includes('\0') || /%00/i.test(input);
}

// ── IP 블랙리스트 (허니팟 트리거 IP 자동 차단) ──

const honeypotBlacklist = new Map<string, number>();
const HONEYPOT_BAN_DURATION = 24 * 60 * 60 * 1000; // 24시간
const HONEYPOT_BLACKLIST_MAX = 50_000;

/**
 * 허니팟에 걸린 IP를 블랙리스트에 추가
 */
export function banHoneypotIp(ip: string): void {
  if (honeypotBlacklist.size >= HONEYPOT_BLACKLIST_MAX) {
    const firstKey = honeypotBlacklist.keys().next().value;
    if (firstKey !== undefined) honeypotBlacklist.delete(firstKey);
  }
  honeypotBlacklist.set(ip, Date.now() + HONEYPOT_BAN_DURATION);
}

/**
 * IP가 허니팟 블랙리스트에 있는지 확인
 */
export function isHoneypotBanned(ip: string): boolean {
  const expiry = honeypotBlacklist.get(ip);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    honeypotBlacklist.delete(ip);
    return false;
  }
  return true;
}

// ── 요청 속도 이상 탐지 (Burst Detection) ──

const burstMap = new Map<string, number[]>();
const BURST_WINDOW_MS = 2_000; // 2초
const BURST_MAX_REQUESTS = 15; // 2초 내 15개 이상이면 버스트
const BURST_MAP_MAX = 20_000;

/**
 * 버스트 요청(짧은 시간 내 과도한 요청) 탐지
 */
export function isBurstRequest(ip: string): boolean {
  const now = Date.now();
  let timestamps = burstMap.get(ip);

  if (!timestamps) {
    if (burstMap.size >= BURST_MAP_MAX) {
      const firstKey = burstMap.keys().next().value;
      if (firstKey !== undefined) burstMap.delete(firstKey);
    }
    burstMap.set(ip, [now]);
    return false;
  }

  // 윈도우 밖의 오래된 타임스탬프 제거
  timestamps = timestamps.filter((ts) => now - ts < BURST_WINDOW_MS);
  timestamps.push(now);
  burstMap.set(ip, timestamps);

  return timestamps.length > BURST_MAX_REQUESTS;
}

// ── 주기적 메모리 정리 ──

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).__secHardeningCleanup === 'undefined') {
  (globalThis as any).__secHardeningCleanup = true;
  setInterval(() => {
    const now = Date.now();
    for (const [ip, expiry] of honeypotBlacklist) {
      if (now > expiry) honeypotBlacklist.delete(ip);
    }
    for (const [ip, timestamps] of burstMap) {
      const filtered = timestamps.filter((ts) => now - ts < BURST_WINDOW_MS);
      if (filtered.length === 0) burstMap.delete(ip);
      else burstMap.set(ip, filtered);
    }
  }, 5 * 60 * 1000); // 5분마다
}
