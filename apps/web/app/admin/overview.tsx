'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminPendingCounts, AdminReportSummary } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatCredits, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { ErrorLine, FilterTabs, errorText } from './admin-ui';
import { usePending } from './pending';
import { Skeleton } from '../ui/skeleton';
import styles from './admin.module.css';

const PERIODS = ['7', '30', '90'] as const;
type Period = (typeof PERIODS)[number];

const DAY = 24 * 60 * 60_000;
/** API-ийн тайлангийн өдрийн хил Улаанбаатарын цагаар (UTC+8). */
const UB_OFFSET_MS = 8 * 60 * 60_000;

function ubDay(ms: number): string {
  return new Date(ms + UB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Өнөөдрийг оролцуулсан сүүлийн `days` хоног ба түүний өмнөх ижил урттай үе. */
function ranges(days: number, now = Date.now()) {
  const current = { from: ubDay(now - (days - 1) * DAY), to: ubDay(now) };
  const previous = { from: ubDay(now - (2 * days - 1) * DAY), to: ubDay(now - days * DAY) };
  return { current, previous };
}

interface Kpi {
  label: MessageKey;
  value: (s: AdminReportSummary) => number;
  format: (n: number) => string;
  hint?: (s: AdminReportSummary) => string;
}

const KPIS: Kpi[] = [
  {
    label: 'adminUi.kpiRevenue',
    value: (s) => s.live.revenue.totalMnt,
    format: formatMnt,
    hint: (s) => t('adminUi.kpiRevenueHint', { count: formatNumber(s.live.revenue.payments) }),
  },
  {
    label: 'adminUi.kpiSales',
    value: (s) => s.live.sales.grossMnt,
    format: formatMnt,
    hint: (s) => t('adminUi.kpiSalesHint', { count: formatNumber(s.live.sales.purchases) }),
  },
  { label: 'adminUi.kpiPlatform', value: (s) => s.live.sales.platformMnt, format: formatMnt },
  { label: 'adminUi.kpiCreditsSpent', value: (s) => s.live.credits.spent, format: formatCredits },
  { label: 'adminUi.kpiPayoutsPaid', value: (s) => s.payoutsPaidMnt, format: formatMnt },
];

const QUEUES: { key: keyof AdminPendingCounts; label: MessageKey; href: string }[] = [
  { key: 'teacherApplications', label: 'adminUi.pendingTeacherApplications', href: '/admin/teacher-applications' },
  { key: 'courseReviews', label: 'adminUi.pendingCourseReviews', href: '/admin/course-reviews' },
  { key: 'payouts', label: 'adminUi.pendingPayouts', href: '/admin/payouts' },
  { key: 'paymentIssues', label: 'adminUi.pendingPaymentIssues', href: '/admin/payments' },
];

export function AdminOverview() {
  const [period, setPeriod] = useState<Period>('30');
  const [data, setData] = useState<{ current: AdminReportSummary; previous: AdminReportSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const { current, previous } = ranges(Number(period));
    const q = (r: { from: string; to: string }) => `/admin/reports/summary?from=${r.from}&to=${r.to}`;
    setData(null);
    setError(null);
    Promise.all([api<AdminReportSummary>(q(current)), api<AdminReportSummary>(q(previous))])
      .then(([c, p]) => alive && setData({ current: c.data, previous: p.data }))
      .catch((err: unknown) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [period]);

  return (
    <>
      <PendingSection />

      <section className={styles.stack} aria-labelledby="kpi-title">
        <div className={styles.sectionHead}>
          <h2 id="kpi-title" className={styles.subtitle}>
            {t('adminUi.kpiTitle')}
          </h2>
          <FilterTabs
            label={t('adminUi.periodLabel')}
            value={period}
            onChange={setPeriod}
            items={PERIODS.map((p) => ({ key: p, label: t(`adminUi.period${p}` as MessageKey) }))}
          />
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
        <div className={styles.kpiGrid} aria-busy={!data && !error}>
          {KPIS.map((k) => (
            <KpiCard key={k.label} kpi={k} data={data} days={Number(period)} />
          ))}
        </div>
      </section>

      <section className={styles.stack} aria-labelledby="top-courses-title">
        <div className={styles.sectionHead}>
          <h2 id="top-courses-title" className={styles.subtitle}>
            {t('adminUi.topCoursesTitle')}
          </h2>
          <Link href="/admin/reports" className={styles.anchor}>
            {t('adminUi.fullReport')} →
          </Link>
        </div>
        {!data && !error && <Skeleton height={160} radius={12} />}
        {data && data.current.topCourses.length === 0 && <p className={styles.hint}>{t('adminUi.topCoursesEmpty')}</p>}
        {data && data.current.topCourses.length > 0 && (
          <ol className={styles.rankList}>
            {data.current.topCourses.slice(0, 5).map((c) => (
              <li key={c.courseId} className={styles.rankItem}>
                <Link href={`/admin/courses/${c.courseId}`} className={styles.rankTitle}>
                  {c.title}
                </Link>
                <span className={styles.muted}>{c.teacher.name ?? '—'}</span>
                <span className={styles.rankValue}>{formatMnt(c.grossMnt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function KpiCard({ kpi, data, days }: { kpi: Kpi; data: { current: AdminReportSummary; previous: AdminReportSummary } | null; days: number }) {
  if (!data) {
    return (
      <div className={styles.kpi}>
        <span className={styles.kpiLabel}>{t(kpi.label)}</span>
        <Skeleton height={32} width="70%" radius={8} />
        <Skeleton height={14} width="50%" radius={6} />
      </div>
    );
  }
  const cur = kpi.value(data.current);
  const prev = kpi.value(data.previous);
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{t(kpi.label)}</span>
      <span className={styles.kpiValue}>{kpi.format(cur)}</span>
      <span className={styles.kpiFoot}>
        <Delta cur={cur} prev={prev} days={days} />
        {kpi.hint && <span className={styles.muted}>{kpi.hint(data.current)}</span>}
      </span>
    </div>
  );
}

function Delta({ cur, prev, days }: { cur: number; prev: number; days: number }) {
  const label = t('adminUi.vsPrevious', { days: String(days) });
  if (prev === 0) {
    return (
      <span className={styles.deltaFlat} title={label}>
        {cur === 0 ? '—' : t('adminUi.deltaNew')}
      </span>
    );
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const cls = pct > 0 ? styles.deltaUp : pct < 0 ? styles.deltaDown : styles.deltaFlat;
  const sign = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
  return (
    <span className={cls} title={label}>
      {sign} {Math.abs(pct)}%<span className={styles.visuallyHidden}> {label}</span>
    </span>
  );
}

function PendingSection() {
  const pending = usePending();
  const none = pending !== null && QUEUES.every((q) => pending[q.key] === 0);
  return (
    <section className={styles.stack} aria-labelledby="pending-title">
      <h2 id="pending-title" className={styles.subtitle}>
        {t('adminUi.pendingTitle')}
      </h2>
      {none ? (
        <p className={styles.hint}>{t('adminUi.pendingNone')}</p>
      ) : (
        <ul className={styles.queueGrid}>
          {QUEUES.map((q) => {
            const n = pending?.[q.key];
            return (
              <li key={q.key}>
                <Link href={q.href} className={styles.queue} data-active={n ? 'true' : undefined}>
                  <span className={styles.queueCount}>{n === undefined ? '…' : formatNumber(n)}</span>
                  <span className={styles.queueLabel}>{t(q.label)}</span>
                  <span className={styles.queueArrow} aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
