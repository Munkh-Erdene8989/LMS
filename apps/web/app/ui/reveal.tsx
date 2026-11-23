'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import styles from './reveal.module.css';

/** `ssr` — JS-гүй / hydrate-ээс өмнө харагдана; `hidden` — харагдах хүртэл; `in` — орсон. */
export type RevealPhase = 'ssr' | 'hidden' | 'in';

// SSR-д useLayoutEffect анхааруулга гаргадаг тул server дээр useEffect.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Нэг удаагийн IntersectionObserver reveal. Буцаах `phase`-ийг `data-reveal`-д тавина.
 * reduced-motion / IntersectionObserver байхгүй бол шууд `in`.
 */
export function useReveal<T extends Element = HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<RevealPhase>('ssr');

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('in');
      return;
    }
    setPhase('hidden');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase('in');
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, phase };
}

export interface RevealProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Дарааллын саатал (0–2 → 0/80/160ms). */
  delay?: 0 | 1 | 2;
}

export function Reveal({ children, as: Tag = 'div', className, delay = 0 }: RevealProps) {
  const { ref, phase } = useReveal<HTMLElement>();
  const cls = [styles.reveal, delay === 1 && styles.d1, delay === 2 && styles.d2, className].filter(Boolean).join(' ');
  return (
    <Tag ref={ref} className={cls} data-reveal={phase}>
      {children}
    </Tag>
  );
}
