
'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store';
import { elementClassMap } from '@/types/design';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 개별 선택자 — 테마/언어와 무관한 상태 변경 시 리렌더 방지
  const currentUser = useStore((s) => s.currentUser);
  const themeSettings = useStore((s) => s.themeSettings);
  const customDesignTheme = useStore((s) => s.customDesignTheme);
  const language = useStore((s) => s.language);
  const pathname = usePathname();
  const disableCustomDesign = pathname === '/design-editor';

  const getContrastHex = (hexColor: string): string => {
    const hex = hexColor?.replace('#', '');
    if (!hex || hex.length !== 6) return '#ffffff';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111827' : '#ffffff';
  };

  const injectedDesignCss = useMemo(() => {
    if (disableCustomDesign) return '';

    const theme = customDesignTheme.theme;
    const elementColors = customDesignTheme.elementColors ?? {};

    const hasAny =
      customDesignTheme.theme !== null || Object.keys(elementColors).length > 0;

    if (!hasAny) return '';

    const rules: string[] = [];

    if (theme) {
      rules.push(
        `body { background-color: ${theme.backgroundColor} !important; color: ${theme.textColor} !important; }`
      );
      rules.push(`.app-header { background-color: ${theme.headerColor} !important; }`);
    }

    for (const [id, value] of Object.entries(elementColors)) {
      const selectorInfo = elementClassMap[id];
      if (!selectorInfo) continue;

      if (selectorInfo.type === 'background') {
        const shouldSetContrastText =
          id.includes('button') || id.includes('tab') || id.includes('badge');

        const explicitTextId = `${id}-text`;
        const hasExplicitTextColor = Object.prototype.hasOwnProperty.call(
          elementColors,
          explicitTextId
        );

        if (shouldSetContrastText && !hasExplicitTextColor) {
          rules.push(
            `${selectorInfo.selector} { background-color: ${value} !important; color: ${getContrastHex(value)} !important; }`
          );
        } else {
          rules.push(`${selectorInfo.selector} { background-color: ${value} !important; }`);
        }
        continue;
      }

      if (selectorInfo.type === 'border') {
        rules.push(`${selectorInfo.selector} { border-color: ${value} !important; }`);
        continue;
      }

      rules.push(`${selectorInfo.selector} { color: ${value} !important; }`);
    }

    return rules.join('\n');
  }, [customDesignTheme.theme, customDesignTheme.elementColors, disableCustomDesign]);

  const hexToHslTriplet = (hexColor: string): string | null => {
    const hex = hexColor?.replace('#', '');
    if (!hex || (hex.length !== 6 && hex.length !== 3)) return null;

    const full =
      hex.length === 3
        ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
        : hex;

    const r = parseInt(full.substring(0, 2), 16) / 255;
    const g = parseInt(full.substring(2, 4), 16) / 255;
    const b = parseInt(full.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = ((g - b) / delta) % 6;
          break;
        case g:
          h = (b - r) / delta + 2;
          break;
        case b:
          h = (r - g) / delta + 4;
          break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  // Initialize color theme
  useEffect(() => {
    const colorTheme = currentUser?.theme || themeSettings?.color || 'blue';
    document.documentElement.setAttribute('data-theme', colorTheme);
  }, [currentUser?.theme, themeSettings?.color]);

  // Initialize document language
  useEffect(() => {
    const lang = language === 'en' || language === 'ja' || language === 'ko' ? language : 'ko';
    document.documentElement.setAttribute('lang', lang);
  }, [language]);

  // Apply custom design theme as CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const elementColors = customDesignTheme.elementColors ?? {};

    if (disableCustomDesign) {
      root.style.removeProperty('--custom-primary');
      root.style.removeProperty('--custom-secondary');
      root.style.removeProperty('--custom-background');
      root.style.removeProperty('--custom-text');
      root.style.removeProperty('--custom-button');
      root.style.removeProperty('--custom-card');
      root.style.removeProperty('--custom-header');

      root.style.removeProperty('--background');
      root.style.removeProperty('--foreground');
      root.style.removeProperty('--card');
      root.style.removeProperty('--card-foreground');
      root.style.removeProperty('--theme-primary');
      root.style.removeProperty('--theme-primary-foreground');

      root.classList.remove('custom-theme-applied');

      for (let i = root.style.length - 1; i >= 0; i -= 1) {
        const propName = root.style[i];
        if (propName.startsWith('--custom-element-')) {
          root.style.removeProperty(propName);
        }
      }

      return;
    }
    
    if (customDesignTheme.theme) {
      const theme = customDesignTheme.theme;
      root.style.setProperty('--custom-primary', theme.primaryColor);
      root.style.setProperty('--custom-secondary', theme.secondaryColor);
      root.style.setProperty('--custom-background', theme.backgroundColor);
      root.style.setProperty('--custom-text', theme.textColor);
      root.style.setProperty('--custom-button', theme.buttonColor);
      root.style.setProperty('--custom-card', theme.cardColor);
      root.style.setProperty('--custom-header', theme.headerColor);
      const bg = hexToHslTriplet(theme.backgroundColor);
      const fg = hexToHslTriplet(theme.textColor);
      const card = hexToHslTriplet(theme.cardColor);
      const cardFg = hexToHslTriplet(theme.textColor);
      const primary = hexToHslTriplet(theme.buttonColor);
      const primaryFg = hexToHslTriplet(getContrastHex(theme.buttonColor));

      if (bg) root.style.setProperty('--background', bg);
      if (fg) root.style.setProperty('--foreground', fg);
      if (card) root.style.setProperty('--card', card);
      if (cardFg) root.style.setProperty('--card-foreground', cardFg);
      if (primary) root.style.setProperty('--theme-primary', primary);
      if (primaryFg) root.style.setProperty('--theme-primary-foreground', primaryFg);

      root.classList.add('custom-theme-applied');
    } else {
      root.style.removeProperty('--custom-primary');
      root.style.removeProperty('--custom-secondary');
      root.style.removeProperty('--custom-background');
      root.style.removeProperty('--custom-text');
      root.style.removeProperty('--custom-button');
      root.style.removeProperty('--custom-card');
      root.style.removeProperty('--custom-header');

      root.style.removeProperty('--background');
      root.style.removeProperty('--foreground');
      root.style.removeProperty('--card');
      root.style.removeProperty('--card-foreground');
      root.style.removeProperty('--theme-primary');
      root.style.removeProperty('--theme-primary-foreground');

      root.classList.remove('custom-theme-applied');
    }

    for (let i = root.style.length - 1; i >= 0; i -= 1) {
      const propName = root.style[i];
      if (propName.startsWith('--custom-element-')) {
        root.style.removeProperty(propName);
      }
    }

    Object.entries(elementColors).forEach(([id, color]) => {
      root.style.setProperty(`--custom-element-${id}`, color);
    });
  }, [customDesignTheme, disableCustomDesign]);

  // Initialize dark/light mode
  useEffect(() => {
    const mode = themeSettings?.mode || 'system';
    
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    if (mode === 'dark') {
      applyTheme(true);
    } else if (mode === 'light') {
      applyTheme(false);
    } else {
      // System mode
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      // Listen for system theme changes
      const handleChange = (e: MediaQueryListEvent) => {
        if (themeSettings?.mode === 'system') {
          applyTheme(e.matches);
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themeSettings?.mode]);

  return (
    <>
      {injectedDesignCss ? (
        <style id="custom-design-theme">{injectedDesignCss}</style>
      ) : null}
      {children}
    </>
  );
}
