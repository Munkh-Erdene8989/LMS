'use client';

import { useRef, type ReactNode } from 'react';
import { gsap, useGSAP } from '@/lib/gsap';

/**
 * Hero timeline: гарчгийн үг, lead, CTA, зургийн scale. Зураг (LCP) opacity-оор нуугдахгүй — зөвхөн scale.
 * Targets нь `data-m` атрибутаар. reduced-motion: 0.2s opacity fade, transform үгүй.
 */
export function HeroMotion({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(
        { full: '(prefers-reduced-motion: no-preference)', reduced: '(prefers-reduced-motion: reduce)' },
        (ctx) => {
          if (ctx.conditions?.reduced) {
            gsap.from('[data-m="word"], [data-m="lead"], [data-m="cta"]', { opacity: 0, duration: 0.2, ease: 'none' });
            return;
          }
          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
          tl.from('[data-m="word"]', { y: '0.4em', opacity: 0, duration: 0.9, stagger: 0.07 }, 0.1)
            .from('[data-m="lead"]', { opacity: 0, duration: 0.9 }, 0.7)
            .from('[data-m="cta"]', { opacity: 0, duration: 0.9 }, 0.85)
            .from('[data-m="img"]', { scale: 1.06, duration: 1.2 }, 0);
        },
      );
      root.dataset.motion = 'ready';
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className={className} data-track-section="hero">
      {children}
    </section>
  );
}
