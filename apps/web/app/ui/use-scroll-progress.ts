'use client';

import { useEffect, type RefObject } from 'react';

export interface ScrollProgressOptions {
  /** Viewport-ийн дээрээс хэдэн хувьд прогресс эхлэх (default 0.9). */
  start?: number;
  /** Прогресс 0→1 болох зай, viewport-ийн хувиар (default 0.7). */
  span?: number;
}

/**
 * Элемент дээр `--p` (0..1) CSS хувьсагч тавина: нэг passive scroll + rAF.
 * reduced-motion бол `--p: 1` (эцсийн төлөв). Хөдөлгөөнийг CSS `calc(var(--p) …)`-ээр transform/opacity-д холбоно.
 */
export function useScrollProgress<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { start = 0.9, span = 0.7 }: ScrollProgressOptions = {},
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--p', '1');
      return;
    }
    let ticking = false;
    let frame = 0;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (vh * start - top) / (vh * span)));
      el.style.setProperty('--p', p.toFixed(3));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref, start, span]);
}
