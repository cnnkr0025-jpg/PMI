import type DOMPurifyType from 'dompurify';

let katexLib: typeof import('katex') | null = null;
let purifyInstance: typeof DOMPurifyType | null = null;

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

/** 브라우저 환경에서만 DOMPurify 로드 (서버사이드에서는 null 반환) */
function getDOMPurify(): typeof DOMPurifyType | null {
  if (typeof window === 'undefined') return null;
  if (purifyInstance) return purifyInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('dompurify');
    purifyInstance = mod.default || mod;
    return purifyInstance;
  } catch {
    return null;
  }
}

/** DOMPurify sanitize 옵션 — KaTeX/MathML 출력 전용 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'span', 'div', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn',
    'msup', 'msub', 'mfrac', 'mover', 'munder', 'munderover',
    'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'msqrt', 'mroot',
    'menclose', 'mpadded', 'mphantom', 'mglyph', 'maligngroup',
    'malignmark', 'annotation', 'annotation-xml',
    'svg', 'line', 'path', 'g', 'rect', 'circle',
    'br', 'em', 'strong', 'sup', 'sub',
  ],
  ALLOWED_ATTR: [
    'class', 'style', 'aria-hidden', 'role',
    'xmlns', 'encoding', 'mathvariant', 'stretchy', 'fence',
    'separator', 'lspace', 'rspace', 'accent', 'accentunder',
    'displaystyle', 'scriptlevel', 'width', 'height',
    'd', 'viewBox', 'preserveAspectRatio', 'fill', 'stroke',
    'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  ],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

/**
 * DOM 기반 HTML sanitizer (DOMPurify).
 * KaTeX 출력에서 위험한 태그, 속성, javascript: URI 등을 안전하게 제거합니다.
 * 서버사이드에서는 HTML 엔티티 이스케이프로 대체합니다.
 */
function sanitizeHtml(html: string): string {
  const DOMPurify = getDOMPurify();
  if (DOMPurify) {
    return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
  }
  // 서버사이드 fallback: HTML 엔티티 이스케이프 (KaTeX도 서버에서는 미실행)
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
