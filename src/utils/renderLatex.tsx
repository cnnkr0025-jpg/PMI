let katexLib: typeof import('katex') | null = null;

function getKatex() {
  if (typeof window === 'undefined') return null;
  if (katexLib) return katexLib;
  try {
    katexLib = require('katex');
    return katexLib;
  } catch {
    return null;
  }
}

/**
 * 안전한 HTML 문자열 반환을 위한 sanitizer.
 * KaTeX 출력에서 위험한 태그와 속성을 제거합니다.
 * 단일 pass가 아닌 반복 적용으로 중첩/분할 우회를 방지합니다.
 */
function sanitizeHtml(html: string): string {
  let prev = '';
  let result = html;
  // 반복 적용하여 중첩된 패턴도 완전히 제거
  while (result !== prev) {
    prev = result;
    result = result
      .replace(/<script\b[^]*?<\/script\s*>/gi, '')
      .replace(/<iframe\b[^]*?<\/iframe\s*>/gi, '')
      .replace(/<object\b[^]*?<\/object\s*>/gi, '')
      .replace(/<embed\b[^]*?>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/<script\b/gi, '')
      .replace(/<iframe\b/gi, '');
  }
  return result;
}

export function renderLatex(latex: string): string {
  const katex = getKatex();
  if (!katex) return sanitizeHtml(latex);
  try {
    return sanitizeHtml(katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
      strict: 'warn',
    }));
  } catch {
    return sanitizeHtml(latex);
  }
}

export function renderLatexBlock(latex: string): string {
  const katex = getKatex();
  if (!katex) return sanitizeHtml(latex);
  try {
    return sanitizeHtml(katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      strict: 'warn',
    }));
  } catch {
    return sanitizeHtml(latex);
  }
}
