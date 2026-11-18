'use client';

import { useRef } from 'react';
import { t } from '@/lib/i18n';
import { useScrollProgress } from '../ui/use-scroll-progress';
import type { VarStyle } from './constants';
import styles from './landing.module.css';

/** Moment: үг бүр scroll-той уялдан хар болно (`--p` × үгийн тоо − индекс). JS-гүй бол бүгд хар. */
export function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  useScrollProgress(ref, { start: 0.85, span: 0.55 });
  const words = t('landing.statement').split(' ');
  return (
    <p ref={ref} className={styles.statementText} style={{ '--n': words.length } as VarStyle}>
      {words.map((w, i) => (
        <span key={i}>
          <span className={styles.sw} style={{ '--i': i } as VarStyle}>
            {w}
          </span>{' '}
        </span>
      ))}
    </p>
  );
}
