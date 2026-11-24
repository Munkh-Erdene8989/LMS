'use client';

import gsap from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

/**
 * GSAP-ийн ганц оролт: plugin-ийг нэг удаа бүртгэнэ. Зөвхөн landing-ийн client wrapper-ууд импортлоно —
 * layout.tsx болон server component, бусад route (/courses, /login, …) хэзээ ч импортлохгүй (bundle budget).
 *
 * ScrollTrigger нь initial bundle-д ороогүй (First Load JS budget): scroll-ийн хөдөлгөөн бүгд fold-оос доор тул
 * `onScrollTrigger` нь hydrate-ийн дараа тусдаа chunk-аар ачаалж, нэг удаа бүртгэнэ.
 */
gsap.registerPlugin(useGSAP);

let scrollTrigger: Promise<typeof ScrollTriggerType> | undefined;

function loadScrollTrigger(): Promise<typeof ScrollTriggerType> {
  scrollTrigger ??= import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
    gsap.registerPlugin(ScrollTrigger);
    return ScrollTrigger;
  });
  return scrollTrigger;
}

/**
 * ScrollTrigger бэлэн болсон үед `setup`-ийг дуудна. Буцаах cleanup-ийг useGSAP-ийн cleanup-аас дуудна
 * (unmount хийгдсэн бол `setup` огт ажиллахгүй).
 */
export function onScrollTrigger(setup: (st: typeof ScrollTriggerType) => void | (() => void)): () => void {
  let cancelled = false;
  let cleanup: void | (() => void);
  void loadScrollTrigger().then((st) => {
    if (!cancelled) cleanup = setup(st);
  });
  return () => {
    cancelled = true;
    if (typeof cleanup === 'function') cleanup();
  };
}

export { gsap, useGSAP };
