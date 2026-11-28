'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminPendingCounts, AdminReportSummary } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatCredits, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { ErrorLine, errorText } from './admin-ui';
import { usePending } from './pending';
import { Skeleton } from '../ui/skeleton';
import { KpiCard, KpiGrid, PeriodTabs, QueueGrid, SectionHead, periodRanges, type DayRange, type Period } from '../ui/dashboard-widgets';
import styles from '../ui/dashboard.module.css';

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

/** Админы тойм: хүлээгдэж буй ажил, KPI (өмнөх үетэй харьцуулсан), шилдэг курс. */
export function AdminOverview() {
  const pending = usePending();
  const [period, setPeriod] = useState<Period>('30');
  const [data, setData] = useState<{ current: AdminReportSummary; previous: AdminReportSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = Number(period);

  useEffect(() => {
    let alive = true;
    const { current, previous } = periodRanges(days);
    const q = (r: DayRange) => api<AdminReportSummary>(`/admin/reports/summary?from=${r.from}&to=${r.to}`);
    setData(null);
    setError(null);
    Promise.all([q(current), q(previous)])
      .then(([c, p]) => alive && setData({ current: c.data, previous: p.data }))
      .catch((err: unknown) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [days]);

  return (
    <>
      <section className={styles.stack} aria-labelledby="pending-title">
        <SectionHead id="pending-title" title={t('dashboard.pendingTitle')} />
        <QueueGrid
          emptyText={t('dashboard.pendingNone')}
          items={QUEUES.map((q) => ({ key: q.key, label: t(q.label), href: q.href, count: pending?.[q.key] }))}
        />
      </section>

      <section className={styles.stack} aria-labelledby="kpi-title">
        <SectionHead id="kpi-title" title={t('dashboard.kpiTitle')}>
          <PeriodTabs value={period} onChange={setPeriod} />
        </SectionHead>
        {error && <ErrorLine>{error}</ErrorLine>}
        <KpiGrid busy={!data && !error}>
          {KPIS.map((k) => (
            <KpiCard
              key={k.label}
              label={t(k.label)}
              value={data ? k.format(k.value(data.current)) : null}
              compare={data ? { current: k.value(data.current), previous: k.value(data.previous), days } : undefined}
              hint={data && k.hint ? k.hint(data.current) : undefined}
            />
          ))}
        </KpiGrid>
      </section>

      <section className={styles.stack} aria-labelledby="top-courses-title">
        <SectionHead id="top-courses-title" title={t('adminUi.topCoursesTitle')}>
          <Link href="/admin/reports" className={styles.anchor}>
            {t('adminUi.fullReport')} →
          </Link>
        </SectionHead>
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
