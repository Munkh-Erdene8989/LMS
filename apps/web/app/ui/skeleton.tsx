import type { CSSProperties } from 'react';
import styles from './skeleton.module.css';

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  className?: string;
}

/** Shimmer блок. Декоратив (`aria-hidden`); контейнерт `aria-busy` тавина. */
export function Skeleton({ width = '100%', height = '1em', radius, className }: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    ...(radius !== undefined ? { borderRadius: radius } : null),
  };
  return <span className={[styles.skeleton, className].filter(Boolean).join(' ')} style={style} aria-hidden="true" />;
}

/** Хэд хэдэн мөр бүхий текстийн skeleton (сүүлийн мөр богино). */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height="0.9em" width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}
