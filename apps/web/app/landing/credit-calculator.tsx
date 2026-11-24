'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatCredits, formatMnt } from '@/lib/format';
import { t } from '@/lib/i18n';
import { gsap } from '@/lib/gsap';
import { ScrollReveal } from './scroll-reveal';
import { CREDIT_MNT, courseRemainingCredits, type VarStyle } from './constants';
import styles from './landing.module.css';

/** Жишээ курс (SPEC-д байхгүй, тайлбарын утга): 12 хичээл × 5 кр = 60, курс 45 кр. */
const LESSON_COUNT = 12;
const LESSON_PRICE = 5;
const COURSE_PRICE = 45;
const MAX_OWNED = 9;

export function CreditCalculator() {
  const id = useId();
  const [owned, setOwned] = useState(2);
  const pay = courseRemainingCredits(COURSE_PRICE, owned, LESSON_PRICE);
  const saved = COURSE_PRICE - pay;

  // Харагдах том тоо 0.5s counter-оор өөрчлөгдөнө; aria-live-д эцсийн утга шууд очно (доорх srOnly).
  const bigRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(pay);
  useLayoutEffect(() => {
    const el = bigRef.current;
    if (!el) return;
    const from = shown.current;
    shown.current = pay;
    if (from === pay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatCredits(pay);
      return;
    }
    const counter = { v: from };
    el.textContent = formatCredits(from);
    const tween = gsap.to(counter, {
      v: pay,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = formatCredits(Math.round(counter.v));
      },
      onComplete: () => {
        el.textContent = formatCredits(pay);
      },
    });
    return () => {
      tween.kill();
    };
  }, [pay]);
  return (
    <ScrollReveal className={styles.calc}>
      <div className={styles.calcHead}>
        <span className={styles.calcLabel}>{t('landing.calcExample')}</span>
        <span className={styles.calcRate}>{t('landing.calcRate', { mnt: formatMnt(CREDIT_MNT) })}</span>
      </div>
      <dl className={styles.calcRows}>
        <div>
          <dt>{t('landing.calcLessons', { count: LESSON_COUNT, price: formatCredits(LESSON_PRICE) })}</dt>
          <dd>
            <s>{formatCredits(LESSON_COUNT * LESSON_PRICE)}</s>
          </dd>
        </div>
        <div>
          <dt>{t('landing.calcFull')}</dt>
          <dd>{formatCredits(COURSE_PRICE)}</dd>
        </div>
      </dl>
      <ol className={styles.dots} aria-hidden="true">
        {Array.from({ length: MAX_OWNED }, (_, i) => (
          <li key={i} className={i < owned ? styles.dotOn : undefined} />
        ))}
      </ol>
      <div className={styles.calcCtl}>
        <label htmlFor={`${id}-owned`}>
          {t('landing.calcSliderLabel')} <output htmlFor={`${id}-owned`}>{owned}</output>
        </label>
        <input
          id={`${id}-owned`}
          className={styles.range}
          type="range"
          min={0}
          max={MAX_OWNED}
          step={1}
          value={owned}
          aria-describedby={`${id}-result`}
          onChange={(e) => setOwned(Number(e.target.value))}
        />
      </div>
      <div className={styles.calcResult} id={`${id}-result`} aria-live="polite">
        <span className={styles.calcSmall}>{t('landing.calcPay')}</span>
        <span className={styles.srOnly}>{formatCredits(pay)}</span>
        <span ref={bigRef} className={styles.calcBig} aria-hidden="true">
          {formatCredits(pay)}
        </span>
        <span className={styles.calcSmall}>
          {formatMnt(pay * CREDIT_MNT)} · {t('landing.calcSaved', { credits: formatCredits(saved) })}
        </span>
      </div>
      <div className={styles.calcBar} aria-hidden="true">
        <i style={{ '--sx': pay / COURSE_PRICE } as VarStyle} />
      </div>
      <p className={styles.note}>{t('landing.calcNote')}</p>
    </ScrollReveal>
  );
}
