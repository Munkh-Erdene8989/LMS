'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from './button';
import { Skeleton } from './skeleton';
import styles from './dashboard.module.css';

export const PERIODS = ['7', '30', '90'] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 24 * 60 * 60_000;
/** Тайлангийн өдрийн хил Улаанбаатарын цагаар (UTC+8, DST-гүй) — API-тай ижил. */
const UB_OFFSET_MS = 8 * 60 * 60_000;

function ubDay(ms: number): string {
  return new Date(ms + UB_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DayRange {
  from: string;
  to: string;
}

/** Өнөөдрийг оролцуулсан сүүлийн `days` хоног ба түүний өмнөх ижил урттай үе (`YYYY-MM-DD`). */
export function periodRanges(days: number, now = Date.now()): { current: DayRange; previous: DayRange } {
  return {
    current: { from: ubDay(now - (days - 1) * DAY), to: ubDay(now) },
    previous: { from: ubDay(now - (2 * days - 1) * DAY), to: ubDay(now - days * DAY) },
  };
}

/** 7 / 30 / 90 хоногийн сонголт (`aria-pressed` товчнууд). */
export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="group" aria-label={t('dashboard.periodLabel')} className={styles.periods}>
      {PERIODS.map((p) => (
        <Button key={p} size="sm" variant={p === value ? 'primary' : 'secondary'} aria-pressed={p === value} onClick={() => onChange(p)}>
          {t('dashboard.periodDays', { days: p })}
        </Button>
      ))}
    </div>
  );
}

export function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.subtitle}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function KpiGrid({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div className={styles.kpiGrid} aria-busy={busy}>
      {children}
    </div>
  );
}

/**
 * KPI карт. `value` null бол skeleton. `compare` өгвөл өмнөх үетэй харьцуулсан хувь (▲/▼);
 * `hint` — жижиг нэмэлт мөр (жишээ нь «12 төлбөр»).
 */
export function KpiCard({
  label,
  value,
  compare,
  hint,
}: {
  label: string;
  value: string | null;
  compare?: { current: number; previous: number; days: number };
  hint?: string;
}) {
  if (value === null) {
    return (
      <div className={styles.kpi}>
        <span className={styles.kpiLabel}>{label}</span>
        <Skeleton height={32} width="70%" radius={8} />
        <Skeleton height={14} width="50%" radius={6} />
      </div>
    );
  }
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {(compare || hint) && (
        <span className={styles.kpiFoot}>
          {compare && <Delta {...compare} />}
          {hint && <span className={styles.muted}>{hint}</span>}
        </span>
      )}
    </div>
  );
}

function Delta({ current, previous, days }: { current: number; previous: number; days: number }) {
  const label = t('dashboard.vsPrevious', { days });
  if (previous === 0) {
    return (
      <span className={styles.deltaFlat} title={label}>
        {current === 0 ? '—' : t('dashboard.deltaNew')}
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const cls = pct > 0 ? styles.deltaUp : pct < 0 ? styles.deltaDown : styles.deltaFlat;
  const sign = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
  return (
    <span className={cls} title={label}>
      {sign} {Math.abs(pct)}%<span className={styles.visuallyHidden}> {label}</span>
    </span>
  );
}

export interface QueueItem {
  key: string;
  label: string;
  href: string;
  /** undefined — ачаалж байна */
  count: number | undefined;
}

/** Хүлээгдэж буй ажлын картууд; тоотой нь тодорно. Бүгд 0 бол `emptyText`. */
export function QueueGrid({ items, emptyText }: { items: QueueItem[]; emptyText: string }) {
  if (items.every((q) => q.count === 0)) return <p className={styles.hint}>{emptyText}</p>;
  return (
    <ul className={styles.queueGrid}>
      {items.map((q) => (
        <li key={q.key}>
          <Link href={q.href} className={styles.queue} data-active={q.count ? 'true' : undefined}>
            <span className={styles.queueCount}>{q.count === undefined ? '…' : formatNumber(q.count)}</span>
            <span className={styles.queueLabel}>{q.label}</span>
            <span className={styles.queueArrow} aria-hidden="true">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
