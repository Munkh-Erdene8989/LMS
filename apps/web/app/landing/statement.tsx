'use client';

import { useRef } from 'react';
import { t } from '@/lib/i18n';
import { gsap, onScrollTrigger, useGSAP } from '@/lib/gsap';
import styles from './landing.module.css';

/** Moment: үг бүр scroll-той уялдан тод болно (GSAP scrub). JS-гүй / reduced-motion бол бүгд бүрэн тод. */
export function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  useGSAP(
    () =>
      onScrollTrigger(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap
            .timeline({ scrollTrigger: { trigger: ref.current, start: 'top 85%', end: 'top 30%', scrub: 0.6 } })
            .fromTo('[data-m="sw"]', { opacity: 0.22 }, { opacity: 1, ease: 'none', duration: 0.5, stagger: 0.5 });
        });
        return () => mm.revert();
      }),
    { scope: ref },
  );
  const words = t('landing.statement').split(' ');
  return (
    <p ref={ref} className={styles.statementText}>
      {words.map((w, i) => (
        <span key={i}>
          <span className={styles.sw} data-m="sw">
            {w}
          </span>{' '}
        </span>
      ))}
    </p>
  );
}
