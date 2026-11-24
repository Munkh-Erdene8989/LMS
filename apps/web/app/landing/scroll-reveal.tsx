'use client';

import { useRef, type ReactNode } from 'react';
import { gsap, onScrollTrigger, useGSAP } from '@/lib/gsap';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** true бол шууд хүүхдүүд stagger-тэй орно; үгүй бол wrapper өөрөө. */
  each?: boolean;
  /** Stagger (сек). */
  stagger?: number;
  /** Динамик контентын дараа нэг удаа ScrollTrigger.refresh(). */
  refresh?: boolean;
}

/**
 * Scroll reveal: ScrollTrigger.batch, once. Эхний нуугдсан төлөвийг зөвхөн JS тавина — JS-гүй бол контент бүтэн харагдана.
 * `data-lift` бүхий элемент орсны дараа y:-4 төлөвт байна. reduced-motion: хөдөлгөөнгүй, эцсийн төлөв.
 */
export function ScrollReveal({ children, className, each = false, stagger = 0.06, refresh = false }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      return onScrollTrigger((ScrollTrigger) => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          const targets = each ? Array.from(root.children) : [root];
          gsap.set(targets, { opacity: 0, y: 24 });
          ScrollTrigger.batch(targets, {
            start: 'top 85%',
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, {
                opacity: 1,
                y: (_i, el: Element) => (el.hasAttribute('data-lift') ? -4 : 0),
                duration: 0.6,
                ease: 'power3.out',
                stagger,
                overwrite: true,
              }),
          });
          if (refresh) ScrollTrigger.refresh();
        });
        root.dataset.motion = 'ready';
        return () => mm.revert();
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
