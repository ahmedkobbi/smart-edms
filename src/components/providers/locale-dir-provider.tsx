'use client';

import { useEffect, useState } from 'react';

/**
 * LocaleDirProvider — dynamically sets `dir` and `lang` attributes on <html>
 * based on the user's stored locale preference.
 *
 * When locale is 'ar', sets dir="rtl" and lang="ar".
 * Otherwise sets dir="ltr" and lang="en" (or the selected locale).
 *
 * Also applies the Arabic font family when in RTL mode.
 */
export function LocaleDirProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('smart-edms-locale') || 'en';
    }
    return 'en';
  });

  useEffect(() => {
    const html = document.documentElement;
    const isRtl = locale === 'ar';

    html.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    html.setAttribute('lang', locale);

    if (isRtl) {
      html.style.setProperty('--font-active', 'var(--font-arabic)');
      document.body.style.fontFamily = 'var(--font-arabic), var(--font-geist-sans), sans-serif';
    } else {
      html.style.setProperty('--font-active', 'var(--font-geist-sans)');
      document.body.style.fontFamily = 'var(--font-geist-sans), sans-serif';
    }
  }, [locale]);

  // Listen for locale changes from other tabs/windows
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'smart-edms-locale' && e.newValue) {
        setLocale(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return <>{children}</>;
}
