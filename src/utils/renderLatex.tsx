import DOMPurify from 'isomorphic-dompurify';

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
 * DOM 기반 HTML sanitizer (DOMPurify).
 * KaTeX 출력에서 위험한 태그, 속성, javascript: URI 등을 안전하게 제거합니다.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
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
  });
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
