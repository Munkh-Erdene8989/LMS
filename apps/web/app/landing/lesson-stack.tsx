'use client';

import { useRef } from 'react';
import { formatPrice } from '@/lib/format';
import { t } from '@/lib/i18n';
import { gsap, onScrollTrigger, useGSAP } from '@/lib/gsap';
import styles from './landing.module.css';

const LESSONS = [
  { title: 'landing.lesson1', meta: 'landing.lesson1Meta', price: 0, locked: false },
  { title: 'landing.lesson2', meta: 'landing.lesson2Meta', price: 15, locked: false },
  { title: 'landing.lesson3', meta: 'landing.lesson3Meta', price: 20, locked: false },
  { title: 'landing.lesson4', meta: 'landing.lesson4Meta', price: 25, locked: true },
] as const;

/** Moment 1: scroll-ээр card томорч, мөрүүд зэрэглэн орно (GSAP scrub). Reduced-motion: статик. */
export function LessonStack() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () =>
      onScrollTrigger(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap
            .timeline({
              defaults: { ease: 'none' },
              scrollTrigger: { trigger: ref.current, start: 'top 90%', end: 'top 20%', scrub: 0.6 },
            })
            .fromTo('[data-m="device"]', { scale: 0.82 }, { scale: 1 }, 0)
            .fromTo('[data-m="row"]', { y: (i: number) => (i + 1) * 14, opacity: 0.35 }, { y: 0, opacity: 1 }, 0);
        });
        return () => mm.revert();
      }),
    { scope: ref },
  );

  return (
    <div ref={ref} className={styles.stage} data-track-section="lesson_stack">
      <div className={styles.stageSticky}>
        <div className={styles.device} data-m="device" role="group" aria-label={t('landing.stackLabel')}>
          <div className={styles.deviceTop}>
            <div>
              <p className={styles.deviceTitle}>{t('landing.stackTitle')}</p>
              <p className={styles.deviceSub}>{t('landing.stackSub', { count: 12 })}</p>
            </div>
            <span className={styles.pill} aria-label={t('landing.stackBalance', { count: 120 })}>
              <span className={styles.coin} aria-hidden="true" />
              120
            </span>
          </div>
          <ul className={styles.rows}>
            {LESSONS.map((l) => (
              <li key={l.title} className={`${styles.row} ${l.locked ? styles.locked : ''}`} data-m="row">
                <span className={styles.dot} aria-hidden="true">
                  {l.locked ? '○' : '▶'}
                </span>
                <span className={styles.rowText}>
                  {t(l.title)}
                  <small>{t(l.meta)}</small>
                </span>
                <span className={styles.rowPrice}>{formatPrice(l.price)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>{t('landing.stackNote')}</p>
        </div>
      </div>
    </div>
  );
}
