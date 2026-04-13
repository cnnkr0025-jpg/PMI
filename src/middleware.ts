import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { jwtVerify, importSPKI } from 'jose';
import { sendTrapNetAlert, sendSecurityAlert } from '@/lib/alerting';

// ══════════════════════════════════════════════════════════════
// ① 화이트리스트 시스템 — 모든 보안 검사보다 선행
// ══════════════════════════════════════════════════════════════

// 검색엔진 / 합법적 봇 UA (case-insensitive 매칭)
const KNOWN_BOT_UA_KEYWORDS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
  'slurp',          // Yahoo
  'facebot', 'facebookexternalhit',
  'twitterbot', 'linkedinbot', 'pinterestbot',
  'applebot', 'discordbot', 'telegrambot', 'whatsapp',
  'kakao',          // KakaoTalk link preview
  'slackbot', 'slack-imgproxy',
  'mj12bot', 'semrushbot', 'ahrefsbot', 'dotbot',
  'petalbot',       // Huawei
  'bytespider',     // TikTok
  'gptbot', 'chatgpt-user', 'claudebot', 'anthropic',  // AI crawlers
  'vercel-edge-functions', 'vercel-cron',
  'uptime', 'pingdom', 'statuspage', 'site24x7',       // Monitoring
  'lighthouse', 'pagespeed', 'gtmetrix',                // Performance
];
const botUaLower = KNOWN_BOT_UA_KEYWORDS.map(k => k.toLowerCase());

function isKnownBot(ua: string): boolean {
  const lower = ua.toLowerCase();
  return botUaLower.some(k => lower.includes(k));
}

// 개발/스테이징 환경 안전 IP 대역
function isDevSafeIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  // Private 대역: 10.x, 172.16-31.x, 192.168.x
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

// 환경변수로 관리되는 추가 화이트리스트 IP (쉼표 구분)
const EXTRA_WHITELIST_IPS = new Set(
  (process.env.SECURITY_WHITELIST_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
);

function isWhitelistedIp(ip: string): boolean {
  return EXTRA_WHITELIST_IPS.has(ip);
}

// Next.js 내부 요청 경로 (보안 검사 불필요)
function isNextInternalPath(p: string): boolean {
  return p.startsWith('/_next/') || p === '/favicon.ico' || p.startsWith('/__nextjs_');
}

const isDev = process.env.NODE_ENV !== 'production';

// ══════════════════════════════════════════════════════════════
// ② PathTrie — Set.has() O(1) + Trie O(k) 접두사 매칭
//    80개 고정 경로를 Set으로, 패턴 매칭은 단일 통합 정규식으로
// ══════════════════════════════════════════════════════════════

class PathTrie {
  private children = new Map<string, PathTrie>();
  private isEnd = false;

  insert(path: string): void {
    let node: PathTrie = this;
    const segments = path.toLowerCase().replace(/\/+/g, '/').split('/').filter(Boolean);
    for (const seg of segments) {
      let child = node.children.get(seg);
      if (!child) { child = new PathTrie(); node.children.set(seg, child); }
      node = child;
    }
    node.isEnd = true;
  }

  /** 정확한 경로 일치 또는 접두사 일치 (하위 경로 포함) */
  match(path: string): boolean {
    let node: PathTrie = this;
    const segments = path.toLowerCase().replace(/\/+/g, '/').split('/').filter(Boolean);
    for (const seg of segments) {
      if (node.isEnd) return true;  // 접두사 일치
      const child = node.children.get(seg);
      if (!child) return false;
      node = child;
    }
    return node.isEnd;
  }
}

// 1단계 고정 경로 → Set (O(1) exact match)
const HONEYPOT_EXACT = new Set([
  '/.env', '/.env.local', '/.env.production', '/.git', '/.git/config', '/.git/head',
  '/.svn', '/.htaccess', '/.htpasswd', '/wp-admin', '/wp-login.php', '/wp-content',
  '/administrator', '/phpmyadmin', '/phpinfo.php', '/server-status', '/server-info',
  '/cgi-bin', '/config.php', '/config.yml', '/config.json', '/database.yml',
  '/docker-compose.yml', '/dockerfile', '/.aws/credentials', '/.ssh/id_rsa',
  '/etc/passwd', '/etc/shadow', '/proc/self/environ', '/actuator',
  '/console', '/xmlrpc.php', '/backup.sql', '/dump.sql', '/db.sql', '/web.config',
]);

// 2단계 고급 경로 → Set (O(1))
const ADVANCED_HONEYPOT_EXACT = new Set([
  '/api/graphql', '/api/v1/graphql', '/api/v2/graphql',
  '/api/internal', '/api/internal/health', '/api/internal/metrics',
  '/api/debug', '/api/debug/vars', '/api/debug/pprof',
  '/api/_internal', '/api/__admin', '/api/admin/shell',
  '/api/admin/sql', '/api/admin/exec', '/api/admin/eval',
  '/.well-known/jwks.json', '/api/swagger.json', '/api/openapi.json',
  '/api-docs', '/swagger-ui', '/redoc',
  '/metrics', '/prometheus', '/health', '/healthz', '/readyz',
  '/api/config', '/api/env', '/api/secrets',
  '/.next/server', '/.next/static', '/api/source-map',
  '/node_modules', '/package.json', '/package-lock.json', '/yarn.lock',
  '/.npmrc', '/.yarnrc', '/tsconfig.json',
  '/api/admin/login.php', '/api/rest/v1', '/api/v1/users',
  '/api/v1/auth/token', '/api/v1/admin', '/api/v2/admin',
  '/api/v1/pods', '/api/v1/namespaces', '/api/v1/nodes',
  '/docker-api', '/portainer',
  '/api/credentials', '/api/tokens', '/api/keys',
  '/api/admin/credentials', '/api/admin/keys',
  '/.docker/config.json', '/api/aws/credentials',
]);

// 3단계 접두사 매칭 → PathTrie (O(depth))
const honeypotTrie = new PathTrie();
[
  '/.env', '/.git', '/.svn', '/.aws', '/.ssh', '/.docker',
  '/wp-admin', '/wp-content', '/wp-includes',
  '/phpmyadmin', '/adminer', '/phpinfo',
  '/.well-known/openid', '/.well-known/oauth',
  '/api/internal', '/api/debug', '/api/_internal', '/api/__admin',
].forEach(p => honeypotTrie.insert(p));

// 4단계 패턴 매칭 → 단일 통합 정규식 (1회 exec vs 기존 10회 .some())
const HONEYPOT_UNIFIED_RE = new RegExp([
  /\/\.(env|git|svn|htaccess|htpasswd|aws|ssh|docker)/.source,
  /\/(wp-|wordpress|joomla|drupal)/.source,
  /\/(phpmyadmin|adminer|phpinfo)/.source,
  /\/(backup|dump|export|db)\.(sql|zip|tar|gz|bak)/.source,
  /\/(config|settings|credentials)\.(php|yml|yaml|json|xml|ini)/.source,
  /\/__debug|\/debug\//.source,
  /\/(trace|traces|tracing|zipkin|jaeger)/.source,
  /\/graphql\/?(\?.*)?$/.source,
  /\/api\/v\d+\/(admin|internal|debug|system)/.source,
].join('|'), 'i');

function isHoneypotPath(p: string): boolean {
  const n = p.toLowerCase().replace(/\/+/g, '/');
  // 순서: Set O(1) → Trie O(k) → 단일 정규식 O(n)
  if (HONEYPOT_EXACT.has(n)) return true;
  if (ADVANCED_HONEYPOT_EXACT.has(n)) return true;
  if (honeypotTrie.match(n)) return true;
  return HONEYPOT_UNIFIED_RE.test(n);
}

function isAdvancedHoneypot(p: string): boolean {
  return ADVANCED_HONEYPOT_EXACT.has(p.toLowerCase().replace(/\/+/g, '/'));
}

// ══════════════════════════════════════════════════════════════
// ③ 악성 UA 탐지 — 단일 통합 정규식
// ══════════════════════════════════════════════════════════════

const MALICIOUS_UA_RE = new RegExp([
  'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'gobuster', 'dirbuster',
  'wpscan', 'nuclei', 'httpx', 'ffuf', 'feroxbuster', 'burpsuite',
  'acunetix', 'nessus', 'openvas', 'w3af', 'arachni', 'havij', 'metasploit',
  'hydra', 'medusa',
  'katana', 'subfinder', 'interactsh', 'dalfox', 'gau',
  'hakrawler', 'waybackurls', 'caido', 'puredns',
  'censys', 'shodan', 'zoomeye',
  'python-requests', 'python-urllib', 'go-http-client',
  'libwww-perl',
].join('|'), 'i');

// curl, wget, axios, java는 경로가 /api/인 경우에만 차단 (오탐 방지)
const TOOL_UA_STRICT_RE = /\b(curl\/|wget\/|axios\/|java\/)\b/i;

function isMaliciousUA(ua: string | null, isApiPath: boolean): boolean {
  if (!ua || ua.length > 1000) return true;
  if (MALICIOUS_UA_RE.test(ua)) return true;
  if (isApiPath && TOOL_UA_STRICT_RE.test(ua)) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// ④ 공격 페이로드 탐지 — 단일 통합 정규식
// ══════════════════════════════════════════════════════════════

const ATTACK_PAYLOAD_RE = new RegExp([
  // SQL Injection
  /\bunion\b.*\bselect\b/.source,
  /\bor\b\s+1\s*=\s*1/.source,
  /'\s*or\s+'/.source,
  /--\s*$/.source,
  /\bwaitfor\s+delay/.source,
  /;\s*drop\s+table/.source,
  /\bexec\s*\(/.source,
  /xp_cmdshell/.source,
  /INTO\s+OUTFILE/.source,
  /LOAD_FILE\s*\(/.source,
  // XSS
  /<script[\s>]/.source,
  /javascript:/.source,
  /on(?:error|load|click|mouseover)\s*=/.source,
  /<img[^>]+onerror/.source,
  /<(?:svg[\s\/]|iframe|object|embed|applet)/.source,
  /<meta[^>]+http-equiv/.source,
  // SSRF
  /(?:127\.0\.0\.1|0\.0\.0\.0|169\.254\.\d+\.\d+|metadata\.google|100\.100\.100\.200)/.source,
  /\b(?:file|gopher|dict|ftp):\/\//.source,
  // Prototype Pollution
  /__proto__/.source,
  /constructor\s*\[/.source,
  /prototype\s*\[/.source,
  // Log4Shell
  /\$\{jndi:/.source,
  /%24%7Bjndi/.source,
  // Path traversal (double)
  /(?:\.\.[\/\\]){2,}/.source,
  // Command Injection
  /\|\s*\w/.source,
  /;\s*\w/.source,
  /`[^`]+`/.source,
  /\$\(\s*\w/.source,
].join('|'), 'i');

function hasAttackPayload(url: string): boolean {
  try {
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    return ATTACK_PAYLOAD_RE.test(decoded);
  } catch {
    // decodeURIComponent 실패 → 비정상 인코딩 자체가 의심
    return true;
  }
}

// ══════════════════════════════════════════════════════════════
// ⑤ 경로 순회 / 널 바이트
// ══════════════════════════════════════════════════════════════

const PATH_TRAVERSAL_RE = /(\.\.[/\\]|%2e%2e[/\\%]|%252e%252e)/i;
function hasPathTraversal(p: string): boolean { return PATH_TRAVERSAL_RE.test(p); }
function hasNullByte(p: string): boolean { return p.includes('\0') || /%00/i.test(p); }

// ══════════════════════════════════════════════════════════════
// ⑥ Edge Runtime 유틸리티
// ══════════════════════════════════════════════════════════════

function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

let _rsaPublicKeyCached: CryptoKey | null = null;
let _rsaKeyAttempted = false;
async function getRsaPublicKey(): Promise<CryptoKey | null> {
  if (_rsaKeyAttempted) return _rsaPublicKeyCached;
  _rsaKeyAttempted = true;
  const raw = process.env.JWT_RSA_PUBLIC_KEY;
  if (!raw) return null;
  try {
    _rsaPublicKeyCached = await importSPKI(raw.replace(/\\n/g, '\n'), 'RS256') as CryptoKey;
    return _rsaPublicKeyCached;
  } catch { return null; }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function stripServerHeaders(response: NextResponse): NextResponse {
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  return response;
}

// ══════════════════════════════════════════════════════════════
// ⑦ Rate Limit / Burst / Ban 인프라
// ══════════════════════════════════════════════════════════════

const slidingWindowMap = new Map<string, number[]>();
const SW_WINDOW_MS = 60_000;
const SW_MAX_REQUESTS = 80;
const SW_MAP_MAX = 30_000;

function slidingWindowCheck(key: string): boolean {
  const now = Date.now();
  let timestamps = slidingWindowMap.get(key);
  if (!timestamps) {
    if (slidingWindowMap.size >= SW_MAP_MAX) {
      const fk = slidingWindowMap.keys().next().value;
      if (fk !== undefined) slidingWindowMap.delete(fk);
    }
    slidingWindowMap.set(key, [now]);
    return false;
  }
  timestamps = timestamps.filter(t => now - t < SW_WINDOW_MS);
  timestamps.push(now);
  slidingWindowMap.set(key, timestamps);
  return timestamps.length > SW_MAX_REQUESTS;
}

const ipHits = new Map<string, { count: number; ts: number }>();
const IP_RATE_LIMIT = 80;
const IP_MAP_MAX_SIZE = 10_000;
let ipHitsCleanupCounter = 0;

function cleanupIpHits(now: number): void {
  for (const [ip, record] of ipHits) {
    if (now - record.ts > 60_000) ipHits.delete(ip);
  }
}

function isIPAbusive(ip: string): boolean {
  const now = Date.now();
  if (++ipHitsCleanupCounter >= 500) { ipHitsCleanupCounter = 0; cleanupIpHits(now); }
  const record = ipHits.get(ip);
  if (!record || now - record.ts > 60_000) {
    if (!record && ipHits.size >= IP_MAP_MAX_SIZE) {
      const firstKey = ipHits.keys().next().value;
      if (firstKey !== undefined) ipHits.delete(firstKey);
    }
    ipHits.set(ip, { count: 1, ts: now });
    return false;
  }
  record.count++;
  return record.count > IP_RATE_LIMIT;
}

const burstMap = new Map<string, number[]>();
const BURST_WINDOW_MS = 2_000;
const BURST_MAX = 15;
const BURST_MAP_MAX = 20_000;

function isBurstRequest(ip: string): boolean {
  const now = Date.now();
  let ts = burstMap.get(ip);
  if (!ts) {
    if (burstMap.size >= BURST_MAP_MAX) {
      const fk = burstMap.keys().next().value;
      if (fk !== undefined) burstMap.delete(fk);
    }
    burstMap.set(ip, [now]);
    return false;
  }
  ts = ts.filter(t => now - t < BURST_WINDOW_MS);
  ts.push(now);
  burstMap.set(ip, ts);
  return ts.length > BURST_MAX;
}

const honeypotBanMap = new Map<string, number>();
const HONEYPOT_BAN_DURATION = 24 * 60 * 60 * 1000;
const HONEYPOT_BAN_MAX = 50_000;

const TEST_IPS = new Set(['218.53.41.16']);

function banIp(ip: string): void {
  if (TEST_IPS.has(ip)) return;
  if (honeypotBanMap.size >= HONEYPOT_BAN_MAX) {
    const fk = honeypotBanMap.keys().next().value;
    if (fk !== undefined) honeypotBanMap.delete(fk);
  }
  honeypotBanMap.set(ip, Date.now() + HONEYPOT_BAN_DURATION);
}

function isIpBanned(ip: string): boolean {
  const exp = honeypotBanMap.get(ip);
  if (!exp) return false;
  if (Date.now() > exp) { honeypotBanMap.delete(ip); return false; }
  return true;
}

// ══════════════════════════════════════════════════════════════
// ⑧ 에스컬레이션 + 알림
// ══════════════════════════════════════════════════════════════

const trapHitCounter = new Map<string, { count: number; ts: number; paths: string[] }>();
const TRAP_HIT_MAX = 20_000;
const TRAP_ESCALATION_THRESHOLD = 3;

function recordTrapHit(ip: string, path: string): 'ban' | 'warn' {
  const now = Date.now();
  const rec = trapHitCounter.get(ip);
  if (rec && now - rec.ts < 600_000) {
    rec.count++;
    if (rec.paths.length < 10) rec.paths.push(path);
    if (rec.count >= TRAP_ESCALATION_THRESHOLD) return 'ban';
    return 'warn';
  }
  if (trapHitCounter.size >= TRAP_HIT_MAX) {
    const fk = trapHitCounter.keys().next().value;
    if (fk !== undefined) trapHitCounter.delete(fk);
  }
  trapHitCounter.set(ip, { count: 1, ts: now, paths: [path] });
  return 'warn';
}

// 알림 쿨다운 (동일 키 2분 내 중복 방지 — Edge 메모리 절약)
const alertCooldownMap = new Map<string, number>();
const ALERT_COOLDOWN_MS = 120_000;

function edgeSecurityAlert(title: string, message: string, severity: string, fields: Record<string, string>): void {
  const key = `${severity}:${title}:${fields.IP || ''}`;
  const now = Date.now();
  const last = alertCooldownMap.get(key);
  if (last && now - last < ALERT_COOLDOWN_MS && severity !== 'critical') return;
  alertCooldownMap.set(key, now);
  if (alertCooldownMap.size > 500) {
    const fk = alertCooldownMap.keys().next().value;
    if (fk !== undefined) alertCooldownMap.delete(fk);
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  const emoji = severity === 'critical' ? '\u{1F525}' : severity === 'error' ? '\u{1F6A8}' : '\u26A0\uFE0F';
  const color = severity === 'critical' ? 0x8b0000 : severity === 'error' ? 0xe74c3c : 0xf39c12;

  if (discordUrl) {
    fetch(discordUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `${emoji} ${title}`,
          description: message.slice(0, 2000),
          color,
          fields: Object.entries(fields).map(([name, value]) => ({ name, value: String(value).slice(0, 1024), inline: true })),
          timestamp: new Date().toISOString(),
          footer: { text: 'PickMyAI TrapNet' },
        }],
      }),
    }).catch(() => {});
  }
  if (slackUrl) {
    fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *${title}*\n${message}\n${Object.entries(fields).map(([k, v]) => `\u2022 ${k}: ${v}`).join('\n')}`,
      }),
    }).catch(() => {});
  }
}

// ══════════════════════════════════════════════════════════════
// ⑨ 가짜 트랩 응답 (법적 안전: 가짜 데이터에 실제 PII 없음)
// ══════════════════════════════════════════════════════════════

function buildFakeTrapResponse(path: string): NextResponse {
  const lp = path.toLowerCase();

  if (lp.includes('graphql')) {
    return NextResponse.json({
      data: null,
      errors: [{ message: 'Unauthorized', locations: [{ line: 1, column: 1 }], extensions: { code: 'UNAUTHENTICATED', timestamp: Date.now() } }],
    }, { status: 401, headers: { 'x-request-id': crypto.randomUUID(), 'x-ratelimit-remaining': '0' } });
  }

  if (lp.includes('credential') || lp.includes('key') || lp.includes('token') || lp.includes('secret')) {
    return NextResponse.json({
      aws_access_key_id: 'AKIA' + 'TRAP' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase(),
      aws_secret_access_key: crypto.randomUUID() + crypto.randomUUID(),
      _canary_marker: 'pickmyai-honeypot-token',
      warning: 'rotating in 30s',
    }, { status: 200, headers: { 'x-canary': 'true' } });
  }

  if (lp.includes('swagger') || lp.includes('openapi') || lp.includes('api-docs')) {
    return NextResponse.json({
      openapi: '3.0.0', info: { title: 'PickMyAI Internal API', version: '0.0.1-dev' },
      paths: {
        '/api/internal/exec': { post: { summary: 'Execute command', security: [{ BearerAuth: [] }] } },
        '/api/internal/db/query': { post: { summary: 'Run SQL', security: [{ BearerAuth: [] }] } },
      },
    }, { status: 200 });
  }

  if (lp.includes('debug') || lp.includes('env') || lp.includes('config')) {
    return NextResponse.json({
      NODE_ENV: 'development',
      DB_HOST: '10.0.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255),
      DB_PORT: '5432',
      DB_NAME: 'pickmyai_dev',
      DB_USER: 'app_readonly',
      REDIS_URL: 'redis://10.0.0.' + Math.floor(Math.random() * 255) + ':6379',
      version: '0.9.2-canary',
      uptime: Math.floor(Math.random() * 86400),
    }, { status: 200 });
  }

  if (lp.includes('health') || lp.includes('metrics') || lp.includes('prometheus')) {
    const body = [
      '# HELP http_requests_total Total HTTP requests',
      '# TYPE http_requests_total counter',
      `http_requests_total{method="GET",code="200"} ${Math.floor(Math.random() * 100000)}`,
      `http_requests_total{method="POST",code="200"} ${Math.floor(Math.random() * 50000)}`,
      '',
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${Math.floor(Math.random() * 500000000)}`,
    ].join('\n');
    return new NextResponse(body, { status: 200, headers: { 'content-type': 'text/plain; version=0.0.4' } });
  }

  if (lp.includes('admin') || lp.includes('shell') || lp.includes('exec') || lp.includes('eval')) {
    return NextResponse.json({
      error: 'Session expired',
      loginUrl: '/api/admin/login',
      hint: 'Use X-Admin-Token header',
    }, { status: 401 });
  }

  return new NextResponse(null, { status: 404 });
}

// ══════════════════════════════════════════════════════════════
// ⑩ 의심 헤더 탐지
// ══════════════════════════════════════════════════════════════

const BYPASS_HEADERS = [
  'x-custom-ip-authorization', 'x-originating-ip', 'x-remote-ip',
  'x-client-ip', 'x-host', 'x-forwarded-server',
  'x-original-url', 'x-rewrite-url', 'x-override-url',
] as const;

function countSuspiciousHeaders(request: NextRequest): number {
  let count = 0;
  const xff = request.headers.get('x-forwarded-for') || '';
  if (xff.split(',').length > 10) count++;
  if (request.headers.get('x-forwarded-host') && request.headers.get('x-forwarded-host') !== request.headers.get('host')) count++;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('application/xml') && accept.includes('text/csv')) count++;
  for (const h of BYPASS_HEADERS) { if (request.headers.get(h)) count++; }
  return count;
}

// ══════════════════════════════════════════════════════════════
// 미들웨어 본체
// ══════════════════════════════════════════════════════════════

export async function middleware(request: NextRequest, event?: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';

  try {

  // ━━━ FAST EXIT: Next.js 내부 에셋 ━━━
  if (isNextInternalPath(pathname)) return NextResponse.next();

  // ━━━ 화이트리스트 판정 (모든 보안 검사 스킵) ━━━
  const whitelisted =
    (isDev && isDevSafeIp(clientIp)) ||   // 개발 환경 로컬 IP
    isWhitelistedIp(clientIp) ||           // 환경변수 관리 IP
    (ua && isKnownBot(ua));                // 검색엔진 봇

  // ⓪ HTTPS 강제 리다이렉트 (prod)
  const proto = request.headers.get('x-forwarded-proto');
  if (!isDev && proto === 'http') {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // 화이트리스트 대상은 보안 함정을 전부 건너뜀
  if (!whitelisted) {

    // ① 이미 차단된 IP
    if (isIpBanned(clientIp)) {
      return new NextResponse(null, { status: 403 });
    }

    // ② 경로 순회 / 널 바이트
    if (hasPathTraversal(pathname) || hasNullByte(pathname)) {
      banIp(clientIp);
      sendTrapNetAlert({
        title: '경로 순회/널 바이트 공격',
        severity: 'error',
        ip: clientIp,
        layer: 2,
        pattern: hasPathTraversal(pathname) ? 'Path Traversal' : 'Null Byte',
        ua: request.headers.get('user-agent') || undefined,
        message: '경로 인젝션 공격이 감지되어 IP가 차단되었습니다.',
      });
      if (event) event.waitUntil(sendSecurityAlert({
        title: '2층 경로 순회/널 바이트 공격',
        severity: 'error',
        message: '경로 인젝션 공격이 감지되어 IP가 차단되었습니다.',
        fields: { IP: clientIp, Pattern: hasPathTraversal(pathname) ? 'Path Traversal' : 'Null Byte', UA: ua },
      }));
      return new NextResponse(null, { status: 400 });
    }

    // ③ 허니팟 — Set O(1) → Trie O(k) → 통합 정규식 O(n)
    if (isHoneypotPath(pathname)) {
      const escalation = recordTrapHit(clientIp, pathname);
      const trapData = trapHitCounter.get(clientIp);
      const hitCount = trapData?.count ?? 1;

      banIp(clientIp);

      if (escalation === 'ban' || hitCount >= TRAP_ESCALATION_THRESHOLD) {
        sendTrapNetAlert({
          title: '허니팟 연쇄 히트 — IP 차단',
          severity: 'critical',
          ip: clientIp,
          layer: 4,
          pattern: (trapData?.paths ?? []).slice(0, 5).join(', '),
          ua: request.headers.get('user-agent') || undefined,
          message: `동일 IP에서 ${hitCount}개 허니팟 경로에 연속 접근했습니다. 자동 스캐너로 판단, 24시간 차단.`,
        });
      } else {
        sendTrapNetAlert({
          title: '허니팟 트랩 발동',
          severity: 'error',
          ip: clientIp,
          layer: isAdvancedHoneypot(pathname) ? 4 : 3,
          pattern: pathname,
          ua: request.headers.get('user-agent') || undefined,
          message: `TrapNet이 공격자를 ${hitCount}번째로 포착했습니다.`,
        });
      }

      if (isAdvancedHoneypot(pathname)) return buildFakeTrapResponse(pathname);
      return new NextResponse(null, { status: 404 });
    }

    // ③-b URL 공격 페이로드
    const fullUrl = request.nextUrl.pathname + request.nextUrl.search;
    if (hasAttackPayload(fullUrl)) {
      const escalation = recordTrapHit(clientIp, `PAYLOAD:${pathname}`);
      if (escalation === 'ban') banIp(clientIp);
      sendTrapNetAlert({
        title: '공격 페이로드 탐지',
        severity: 'error',
        ip: clientIp,
        layer: 5,
        pattern: fullUrl.slice(0, 100),
        ua: request.headers.get('user-agent') || undefined,
        message: 'URL에서 SQL injection / XSS / SSRF 패턴이 감지되었습니다.',
      });
      if (escalation === 'ban') return new NextResponse(null, { status: 403 });
      return NextResponse.json({ error: '요청이 거부되었습니다.' }, { status: 400 });
    }

  } // end of !whitelisted block

  // ━━━ 라우팅 ━━━

  if (pathname === '/' || pathname === '') {
    const hasSession = Boolean(request.cookies.get('session')?.value);
    const url = request.nextUrl.clone();
    url.pathname = hasSession ? '/chat' : '/guide';
    return stripServerHeaders(NextResponse.redirect(url));
  }

  const protectedPaths = ['/chat', '/dashboard', '/settings', '/configurator', '/checkout', '/feedback'];
  const isProtectedPath = protectedPaths.some(p => pathname.startsWith(p));
  const isApiPath = pathname.startsWith('/api/');

  if (!isProtectedPath && !isApiPath) {
    return NextResponse.next();
  }

  // 화이트리스트 아닌 경우에만 UA/버스트/헤더 검사
  if (!whitelisted) {

    // ④ 악성 UA 차단 (API에서만)
    if (isApiPath && isMaliciousUA(ua, true)) {
      recordTrapHit(clientIp, `MAL_UA:${ua.slice(0, 50)}`);
      banIp(clientIp);
      sendTrapNetAlert({
        title: '악성 User-Agent 차단',
        severity: 'warn',
        ip: clientIp,
        layer: 4,
        pattern: 'Malicious UA',
        ua: ua.slice(0, 100),
        message: '공격 도구 User-Agent가 감지되어 차단되었습니다.',
      });
      if (event) event.waitUntil(sendSecurityAlert({
        title: '4층 악성 User-Agent 차단',
        severity: 'warn',
        message: '공격 도구 User-Agent가 감지되어 차단되었습니다.',
        fields: { IP: clientIp, Pattern: 'Malicious UA', UA: ua.slice(0, 100) },
      }));
      return NextResponse.json({ error: '요청이 거부되었습니다.' }, { status: 403 });
    }

    // ⑤ 버스트 탐지
    if (isBurstRequest(clientIp)) {
      sendTrapNetAlert({
        title: '버스트 요청 탐지',
        severity: 'warn',
        ip: clientIp,
        layer: 5,
        pattern: 'Burst (15+ in 2s)',
        ua: request.headers.get('user-agent') || undefined,
        message: '2초 내 15회 이상의 버스트 요청이 감지되었습니다.',
      });
      return NextResponse.json({ error: '요청 속도가 너무 빠릅니다.' }, { status: 429 });
    }

    // ⑥ 의심 헤더
    if (isApiPath) {
      const suspCount = countSuspiciousHeaders(request);
    if (suspCount >= 2) {
      recordTrapHit(clientIp, `SUSP_HEADERS:${suspCount}`);
      sendTrapNetAlert({
        title: '의심스러운 헤더 탐지',
        severity: 'warn',
        ip: clientIp,
        layer: 6,
        pattern: `Suspicious Headers (${suspCount})`,
        ua: request.headers.get('user-agent') || undefined,
        message: `공격 도구 특성 헤더가 ${suspCount}개 감지되었습니다.`,
      });
    }
    }

  } // end of !whitelisted UA/burst block

  // ━━━ 세션 검증 (보호 경로) ━━━
  let sessionUserId: string | undefined;
  if (isProtectedPath) {
    const sessionToken = request.cookies.get('session')?.value;
    if (!sessionToken) return NextResponse.redirect(new URL('/login', request.url));

    let verified = false;
    const jwtOpts = { issuer: 'pick-my-ai', audience: 'pick-my-ai:session' };

    const rsaPubKey = await getRsaPublicKey();
    if (rsaPubKey && process.env.JWT_RSA_PUBLIC_KEY) {
      try {
        const { payload } = await jwtVerify(sessionToken, rsaPubKey, { algorithms: ['RS256'], ...jwtOpts });
        verified = true;
        sessionUserId = payload.userId as string;
      } catch {}
    } else {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) return NextResponse.redirect(new URL('/login', request.url));
        const key = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(sessionToken, key, { algorithms: ['HS256'], ...jwtOpts });
        verified = true;
        sessionUserId = payload.userId as string;
      } catch {}
    }

    if (!verified) return NextResponse.redirect(new URL('/login', request.url));
  }

  // ━━━ Rate Limit (화이트리스트도 적용 — DDoS 방어) ━━━
  const rateLimitKey = sessionUserId ? `${clientIp}:${sessionUserId}` : clientIp;
  if (slidingWindowCheck(rateLimitKey)) {
    return NextResponse.json({ error: '비정상적인 요청 패턴이 감지되었습니다.' }, { status: 429 });
  }
  if (isIPAbusive(clientIp)) {
    return NextResponse.json({ error: '비정상적인 요청 패턴이 감지되었습니다.' }, { status: 429 });
  }

  // ━━━ CSRF ━━━
  const requestHeaders = new Headers(request.headers);
  const existingCsrfToken = request.cookies.get('csrf-token')?.value;
  const csrfTokenForThisRequest = existingCsrfToken || generateCsrfToken();
  requestHeaders.set('x-middleware-csrf-token', csrfTokenForThisRequest);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && isApiPath) {
    const publicEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/social-session'];
    const isPublicEndpoint = publicEndpoints.some(ep => pathname.startsWith(ep));

    if (!isPublicEndpoint) {
      const expectedOrigin = request.nextUrl.origin;
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');
      const isSameOrigin = (origin && origin === expectedOrigin) || (referer && referer.startsWith(expectedOrigin));

      if (!isSameOrigin) {
        const csrfCookie = request.cookies.get('csrf-token');
        const csrfHeader = request.headers.get('x-csrf-token');

        if (!csrfCookie || !csrfHeader) {
          if (!whitelisted) {
            recordTrapHit(clientIp, `CSRF_MISSING:${pathname}`);
            edgeSecurityAlert('CSRF 토큰 누락', 'Cross-origin 요청에서 CSRF 토큰이 누락되었습니다.', 'warn', {
              IP: clientIp, Path: pathname, Method: request.method,
              Origin: origin || 'none', Referer: (referer || 'none').slice(0, 200),
            });
          }
          return NextResponse.json({ error: '요청이 유효하지 않습니다.' }, { status: 403 });
        }

        const EXPECTED_LEN = 64;
        const cv = csrfCookie.value.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
        const hv = csrfHeader.padEnd(EXPECTED_LEN, '\0').slice(0, EXPECTED_LEN);
        let mismatch = csrfCookie.value.length !== EXPECTED_LEN ? 1 : 0;
        mismatch |= csrfHeader.length !== EXPECTED_LEN ? 1 : 0;
        for (let i = 0; i < EXPECTED_LEN; i++) { mismatch |= cv.charCodeAt(i) ^ hv.charCodeAt(i); }
        if (mismatch !== 0) {
          if (!whitelisted) {
            recordTrapHit(clientIp, `CSRF_MISMATCH:${pathname}`);
            edgeSecurityAlert('CSRF 토큰 불일치', 'Cross-origin 요청에서 CSRF 토큰 불일치가 감지되었습니다.', 'error', {
              IP: clientIp, Path: pathname, Method: request.method,
            });
          }
          return NextResponse.json({ error: '요청이 유효하지 않습니다.' }, { status: 403 });
        }
      }
    }
  }

  if (!existingCsrfToken) {
    response.cookies.set('csrf-token', csrfTokenForThisRequest, {
      httpOnly: true,
      secure: !isDev,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24,
    });
  }

  return stripServerHeaders(response);

  } catch (error) {
    if (isDev) console.error('[Middleware] Unexpected error:', error);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'ERR_MW_00', reason: 'Middleware failure' }, { status: 500 });
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
