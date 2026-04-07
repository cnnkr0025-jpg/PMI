/**
 * DOMPurify XSS 방어 래퍼
 * - 외부 라이브러리 없이 자체 구현 (번들 크기 절감)
 * - HTML/SVG/MathML 태그 화이트리스트 기반
 * - 위험 속성/프로토콜 제거
 * - 서버/클라이언트 양쪽에서 사용 가능
 */

// ── 허용 태그 (Markdown 렌더링에 필요한 태그만) ──
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'a', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption',
  'div', 'span', 'section',
  'sup', 'sub', 'abbr',
  'details', 'summary',
  'kbd', 'var', 'samp',
]);

// ── 허용 속성 ──
const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class', 'id',
  'width', 'height', 'target', 'rel',
  'colspan', 'rowspan', 'scope',
  'open', 'loading', 'decoding',
]);

// ── 위험 프로토콜 ──
const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript|mhtml):/i;

// ── 위험 속성 패턴 ──
const DANGEROUS_ATTR_PATTERN = /^on\w+$/i;

/**
 * HTML 문자열을 안전하게 정화
 * - script/style/iframe/object/embed 태그 완전 제거
 * - 이벤트 핸들러 속성 제거 (onclick, onerror 등)
 * - javascript: 프로토콜 제거
 * - data: URI 이미지만 허용 (다른 data: 차단)
 */
export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== 'string' || !dirty) return '';

  let clean = dirty;

  // 1. 위험한 태그 완전 제거 (내용 포함)
  clean = clean.replace(/<script[\s>][\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s>][\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, '');
  clean = clean.replace(/<object[\s>][\s\S]*?<\/object>/gi, '');
  clean = clean.replace(/<embed[\s>][\s\S]*?<\/embed>/gi, '');
  clean = clean.replace(/<form[\s>][\s\S]*?<\/form>/gi, '');
  clean = clean.replace(/<input[^>]*>/gi, '');
  clean = clean.replace(/<textarea[\s>][\s\S]*?<\/textarea>/gi, '');
  clean = clean.replace(/<select[\s>][\s\S]*?<\/select>/gi, '');
  clean = clean.replace(/<button[\s>][\s\S]*?<\/button>/gi, '');

  // 셀프클로징 위험 태그
  clean = clean.replace(/<(script|style|iframe|object|embed|form|link|meta|base)[^>]*\/?>/gi, '');

  // 2. 허용되지 않은 태그 제거 (내용은 유지)
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (ALLOWED_TAGS.has(lower)) {
      // 허용 태그 → 속성 정화
      return sanitizeTagAttributes(match, lower);
    }
    // 비허용 태그 → 태그 제거, 내용 유지
    return '';
  });

  // 3. HTML 주석 제거
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');

  // 4. CDATA 섹션 제거
  clean = clean.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  return clean;
}

/**
 * 태그 내 속성을 정화
 */
function sanitizeTagAttributes(tagHtml: string, tagName: string): string {
  // 닫는 태그는 그대로
  if (tagHtml.startsWith('</')) return tagHtml;

  // 속성 추출
  const attrRegex = /\s([a-zA-Z][a-zA-Z0-9-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  const safeAttrs: string[] = [];
  let match;

  while ((match = attrRegex.exec(tagHtml)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] ?? match[3] ?? match[4] ?? '';

    // 이벤트 핸들러 차단
    if (DANGEROUS_ATTR_PATTERN.test(attrName)) continue;

    // 허용 속성만
    if (!ALLOWED_ATTRS.has(attrName)) continue;

    // href/src 프로토콜 검증
    if (attrName === 'href' || attrName === 'src') {
      const trimmed = attrValue.trim();
      if (DANGEROUS_PROTOCOLS.test(trimmed)) continue;
      // data: URI는 이미지 src에서만 허용
      if (trimmed.startsWith('data:') && !(attrName === 'src' && tagName === 'img' && trimmed.startsWith('data:image/'))) {
        continue;
      }
    }

    safeAttrs.push(`${attrName}="${escapeAttrValue(attrValue)}"`);
  }

  // a 태그에 보안 속성 자동 추가
  if (tagName === 'a') {
    if (!safeAttrs.some(a => a.startsWith('rel='))) {
      safeAttrs.push('rel="noopener noreferrer"');
    }
    if (!safeAttrs.some(a => a.startsWith('target='))) {
      safeAttrs.push('target="_blank"');
    }
  }

  const selfClosing = tagHtml.trimEnd().endsWith('/>');
  return safeAttrs.length > 0
    ? `<${tagName} ${safeAttrs.join(' ')}${selfClosing ? ' />' : '>'}`
    : `<${tagName}${selfClosing ? ' />' : '>'}`;
}

/**
 * 속성 값 이스케이프
 */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 텍스트만 추출 (모든 HTML 태그 제거)
 */
export function stripHtml(html: string): string {
  if (typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, '').replace(/&[a-zA-Z]+;/g, ' ').trim();
}

/**
 * URL을 안전하게 정화
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (DANGEROUS_PROTOCOLS.test(trimmed)) return '';
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return '';
  return trimmed;
}
