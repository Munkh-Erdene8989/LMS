'use client';

import { useEffect, useRef } from 'react';
import { t } from '@/lib/i18n';
import styles from './learning.module.css';

/**
 * 4px ахицын мөр (accent). Өргөнийг `transform: scaleX` + CSS хувьсагчаар (inline style-гүй) удирдана;
 * хөдөлгөөн нь `prefers-reduced-motion`-д унтарна.
 */
export function ProgressBar({ percent }: { percent: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    fill.current?.style.setProperty('--p', String(Math.min(100, Math.max(0, percent)) / 100));
  }, [percent]);
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={t('learning.progressLabel', { percent })}
    >
      <span ref={fill} className={styles.progressFill} />
    </div>
  );
}
