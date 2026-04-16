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
 * 안전한 HTML 문자열 반환을 위한 최소 sanitizer.
 * KaTeX 출력에서 <script>, on* 이벤트 핸들러 등을 제거합니다.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '');
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
