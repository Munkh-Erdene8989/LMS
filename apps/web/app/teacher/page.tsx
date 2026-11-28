'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUbDateTime, type CourseSummary, type TeacherAnalyticsView, type TeacherLiveItem } from '@lms/shared';
import { api, useApiFailure } from '@/lib/client-api';
import { formatCredits, formatMnt, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Skeleton } from '../ui/skeleton';
import { KpiCard, KpiGrid, PeriodTabs, QueueGrid, SectionHead, periodRanges, type DayRange, type Period } from '../ui/dashboard-widgets';
import { useUnreviewed } from './pending';
import ds from '../ui/dashboard.module.css';
import s from './teacher.module.css';

const LIVE_LIMIT = 3;

/**
 * Багшийн тойм: хүлээгдэж буй ажил (шалгаагүй даалгавар, курсийн төлөв), орлого/борлуулалт (7/30/90 хоног,
 * өмнөх үетэй харьцуулсан), ойрын live хичээл. Бүгд одоо байгаа endpoint-оос.
 */
export default function TeacherOverviewPage() {
  const fail = useApiFailure();
  const unreviewed = useUnreviewed();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  const [sales, setSales] = useState<{ current: TeacherAnalyticsView; previous: TeacherAnalyticsView } | null>(null);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [live, setLive] = useState<TeacherLiveItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onErr = (err: unknown) => {
      const msg = fail(err);
      if (msg) setError(msg);
    };
    api<CourseSummary[]>('/teacher/courses').then((r) => setCourses(r.data), onErr);
    api<TeacherLiveItem[]>('/teacher/live-lessons').then((r) => setLive(r.data), onErr);
  }, [fail]);

  useEffect(() => {
    let alive = true;
    const { current, previous } = periodRanges(days);
    const q = (r: DayRange) => api<TeacherAnalyticsView>(`/teacher/analytics?granularity=day&from=${r.from}&to=${r.to}`);
    setSales(null);
    Promise.all([q(current), q(previous)]).then(
      ([c, p]) => alive && setSales({ current: c.data, previous: p.data }),
      (err: unknown) => {
        const msg = alive && fail(err);
        if (msg) setError(msg);
      },
    );
    return () => {
      alive = false;
    };
  }, [days, fail]);

  const count = (pred: (c: CourseSummary) => boolean) => (courses ? courses.filter(pred).length : undefined);
  const cur = sales?.current.totals;
  const prev = sales?.previous.totals;
  const compare = (pick: (x: NonNullable<typeof cur>) => number) =>
    cur && prev ? { current: pick(cur), previous: pick(prev), days } : undefined;
  const upcoming = live ? [...live].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, LIVE_LIMIT) : null;

  return (
    <div className={s.page}>
      <h1 className={s.title}>{t('teacherUi.overviewTitle')}</h1>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      <section className={ds.stack} aria-labelledby="pending-title">
        <SectionHead id="pending-title" title={t('dashboard.pendingTitle')} />
        <QueueGrid
          emptyText={t('dashboard.pendingNone')}
          items={[
            { key: 'assignments', label: t('teacherUi.pendingAssignments'), href: '/teacher/assignments', count: unreviewed ?? undefined },
            {
              key: 'review',
              label: t('teacherUi.pendingInReview'),
              href: '/teacher/courses',
              count: count((c) => c.status === 'IN_REVIEW' || c.pendingLessonCount > 0),
            },
            { key: 'rejected', label: t('teacherUi.pendingRejected'), href: '/teacher/courses', count: count((c) => c.status === 'REJECTED') },
            { key: 'drafts', label: t('teacherUi.pendingDrafts'), href: '/teacher/courses', count: count((c) => c.status === 'DRAFT') },
          ]}
        />
      </section>

      <section className={ds.stack} aria-labelledby="kpi-title">
        <SectionHead id="kpi-title" title={t('dashboard.kpiTitle')}>
          <PeriodTabs value={period} onChange={setPeriod} />
        </SectionHead>
        <KpiGrid busy={!sales}>
          <KpiCard
            label={t('teacherUi.kpiBalance')}
            value={sales ? formatMnt(sales.current.balanceMnt) : null}
            hint={t('teacherUi.kpiBalanceHint')}
          />
          <KpiCard label={t('teacherUi.kpiEarning')} value={cur ? formatMnt(cur.earningMnt) : null} compare={compare((x) => x.earningMnt)} />
          <KpiCard
            label={t('teacherUi.kpiSales')}
            value={cur ? formatMnt(cur.grossMnt) : null}
            compare={compare((x) => x.grossMnt)}
            hint={cur ? t('teacherUi.kpiSalesHint', { count: formatNumber(cur.sales) }) : undefined}
          />
          <KpiCard label={t('teacherUi.kpiCredits')} value={cur ? formatCredits(cur.credits) : null} compare={compare((x) => x.credits)} />
        </KpiGrid>
        <Link href="/teacher/analytics" className={ds.anchor}>
          {t('teacherUi.fullAnalytics')} →
        </Link>
      </section>

      <section className={ds.stack} aria-labelledby="live-title">
        <SectionHead id="live-title" title={t('teacherUi.upcomingLiveTitle')}>
          <Link href="/teacher/live" className={ds.anchor}>
            {t('teacherUi.allLive')} →
          </Link>
        </SectionHead>
        {!upcoming && <Skeleton height={120} radius={12} />}
        {upcoming?.length === 0 && <p className={ds.hint}>{t('teacherUi.upcomingLiveEmpty')}</p>}
        {upcoming && upcoming.length > 0 && (
          <ul className={ds.rankList}>
            {upcoming.map((l) => (
              <li key={l.lessonId} className={`${ds.rankItem} ${ds.rankItemPlain}`}>
                <Link href={`/teacher/courses/${l.courseId}`} className={ds.rankTitle}>
                  {l.lessonTitle}
                </Link>
                <span className={ds.muted}>
                  {l.courseTitle}
                  {!l.published && ` · ${t('teacherUi.notPublished')}`}
                </span>
                <span className={ds.rankValue}>
                  {l.state === 'LIVE' ? <span className={ds.deltaUp}>{t('teacherUi.liveNow')}</span> : formatUbDateTime(l.startsAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
