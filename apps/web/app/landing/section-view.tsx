'use client';

import { useEffect } from 'react';
import { track } from '@/lib/track';

/** Нэг IntersectionObserver: `data-track-section` бүхий section анх 50% харагдахад `section_view` нэг удаа. */
export function SectionView() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const section = (e.target as HTMLElement).dataset.trackSection;
          if (section) track('section_view', { section });
        }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll('[data-track-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
