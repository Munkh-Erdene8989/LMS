'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import styles from './shell.module.css';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS = [
  { value: 'system', label: 'shell.themeSystem' },
  { value: 'light', label: 'shell.themeLight' },
  { value: 'dark', label: 'shell.themeDark' },
] as const;

/** Систем / Гэрэл / Харанхуй. `localStorage.theme` + `<html data-theme>`; «Систем» үед түлхүүр устгана. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      /* storage хаалттай */
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      /* storage хаалттай */
    }
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
  }

  return (
    <div role="group" aria-label={t('shell.themeLabel')} className={styles.theme}>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={theme === o.value} onClick={() => choose(o.value)}>
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}
