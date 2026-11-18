'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AdminReportSummary, ExpiredCreditsReport, ReportSection } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate, formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { ErrorLine, LoadingRows, Pill, errorText } from '../admin-ui';
import styles from '../admin.module.css';

/** Тайлан: орлого, кредит, борлуулалт, шилдэг курс/багш; test гүйлгээ тусад нь; дууссан кредит. */
export default function AdminReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [summary, setSummary] = useState<AdminReportSummary | null>(null);
  const [expired, setExpired] = useState<ExpiredCreditsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams();
    if (range.from) qs.set('from', range.from);
    if (range.to) qs.set('to', range.to);
    const q = qs.size ? `?${qs.toString()}` : '';
    try {
      const [s, e] = await Promise.all([
        api<AdminReportSummary>(`/admin/reports/summary${q}`),
        api<ExpiredCreditsReport>(`/admin/reports/expired-credits${q}`),
      ]);
      setSummary(s.data);
      setExpired(e.data);
      // API-ийн анхдагч хугацааг талбарт тусгана
      setFrom((v) => v || s.data.range.from);
      setTo((v) => v || s.data.range.to);
    } catch (err) {
      setError(errorText(err));
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setRange({ from, to });
  }

  return (
    <div className={styles.stackLg}>
      <h1 className={styles.title}>{t('adminOps.reportsTitle')}</h1>
      <form onSubmit={submit} className={styles.dateRow}>
        <label className={styles.field}>
          {t('adminOps.from')}
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('adminOps.to')}
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="submit">{t('adminOps.show')}</Button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!summary && !error && <LoadingRows />}
      {summary && (
        <>
          <section className={styles.stack} aria-labelledby="rep-live">
            <h2 id="rep-live" className={styles.subtitle}>
              {t('adminOps.liveSection')}
            </h2>
            <SectionView s={summary.live} />
            <p className={styles.line}>
              <strong>{t('adminOps.payoutsPaid', { amount: formatNumber(summary.payoutsPaidMnt) })}</strong>
            </p>
          </section>

          <section className={styles.stack} aria-labelledby="rep-courses">
            <h2 id="rep-courses" className={styles.subtitle}>
              {t('adminOps.topCourses')}
            </h2>
            {summary.topCourses.length === 0 ? (
              <p className={styles.hint}>{t('adminOps.noRows')}</p>
            ) : (
              <DataTable
                title={t('adminOps.topCourses')}
                head={[
                  { label: t('adminOps.colCourse') },
                  { label: t('adminOps.colTeacher') },
                  { label: t('adminOps.colPurchases'), num: true },
                  { label: t('adminOps.colCredits'), num: true },
                  { label: t('adminOps.colGross'), num: true },
                ]}
                rows={summary.topCourses.map((c) => ({
                  key: c.courseId,
                  cells: [c.title, c.teacher.name ?? t('admin.someone'), formatNumber(c.purchases), formatNumber(c.credits), formatMnt(c.grossMnt)],
                }))}
              />
            )}
          </section>

          <section className={styles.stack} aria-labelledby="rep-teachers">
            <h2 id="rep-teachers" className={styles.subtitle}>
              {t('adminOps.topTeachers')}
            </h2>
            {summary.topTeachers.length === 0 ? (
              <p className={styles.hint}>{t('adminOps.noRows')}</p>
            ) : (
              <DataTable
                title={t('adminOps.topTeachers')}
                head={[
                  { label: t('adminOps.colTeacher') },
                  { label: t('adminOps.colSales'), num: true },
                  { label: t('adminOps.colGross'), num: true },
                  { label: t('adminOps.colEarnings'), num: true },
                ]}
                rows={summary.topTeachers.map((x) => ({
                  key: x.teacher.id,
                  cells: [x.teacher.name ?? t('admin.someone'), formatNumber(x.sales), formatMnt(x.grossMnt), formatMnt(x.earningsMnt)],
                }))}
              />
            )}
          </section>

          <section className={`${styles.item} ${styles.dashed}`} aria-labelledby="rep-test">
            <h2 id="rep-test" className={styles.subtitle}>
              {t('adminOps.testSection')}
            </h2>
            <SectionView s={summary.test} />
          </section>
        </>
      )}

      {expired && (
        <section className={styles.stack} aria-labelledby="rep-expired">
          <h2 id="rep-expired" className={styles.subtitle}>
            {t('adminOps.expiredTitle')}
          </h2>
          <p className={styles.line}>
            {t('adminOps.expiredTotals', {
              credits: formatNumber(expired.live.credits),
              lots: formatNumber(expired.live.lots),
              testCredits: formatNumber(expired.test.credits),
              testLots: formatNumber(expired.test.lots),
            })}
          </p>
          <p className={styles.hint}>
            {t('adminOps.upcoming', { live: formatNumber(expired.upcoming30d.live), test: formatNumber(expired.upcoming30d.test) })}
          </p>
          {expired.items.length === 0 ? (
            <p className={styles.hint}>{t('adminOps.noExpired')}</p>
          ) : (
            <DataTable
              title={t('adminOps.expiredTitle')}
              head={[
                { label: t('adminOps.colUser') },
                { label: t('adminOps.colSource') },
                { label: t('adminOps.colInitial'), num: true },
                { label: t('adminOps.colExpired'), num: true },
                { label: t('adminOps.colExpiresAt') },
              ]}
              rows={expired.items.map((r) => ({
                key: r.lotId,
                cells: [
                  <>
                    {[r.user.name ?? t('admin.someone'), r.user.phone, r.user.email].filter(Boolean).join(' · ')}
                    {r.isTest && (
                      <span className={styles.pills}>
                        <Pill tone="neutral">{t('adminOps.testPill')}</Pill>
                      </span>
                    )}
                  </>,
                  t(`adminOps.entry${r.source}` as MessageKey),
                  formatNumber(r.initial),
                  formatNumber(r.expiredCredits),
                  formatDate(r.expiresAt),
                ],
              }))}
            />
          )}
        </section>
      )}
    </div>
  );
}

interface TableHead {
  label: string;
  num?: boolean;
}

function DataTable({ title, head, rows }: { title: string; head: TableHead[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{title}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" className={h.num ? styles.num : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (
                <td key={i} className={head[i]?.num ? styles.num : i === 0 ? styles.wrap : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stats({ title, rows }: { title: string; rows: [label: string, value: string][] }) {
  return (
    <div className={styles.stat}>
      <strong>{title}</strong>
      <dl className={styles.statList}>
        {rows.map(([l, v]) => (
          <div key={l} className={styles.statRow}>
            <dt>{l}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SectionView({ s }: { s: ReportSection }) {
  const n = formatNumber;
  return (
    <div className={styles.stats}>
      <Stats
        title={t('adminOps.revenueTitle')}
        rows={[
          [t('adminOps.revenueTotal'), formatMnt(s.revenue.totalMnt)],
          [t('adminOps.revenueTopup'), formatMnt(s.revenue.topupMnt)],
          [t('adminOps.revenueSubscription'), formatMnt(s.revenue.subscriptionMnt)],
          [t('adminOps.revenuePayments'), n(s.revenue.payments)],
        ]}
      />
      <Stats
        title={t('adminOps.creditsTitle')}
        rows={[
          [t('adminOps.creditTopup'), n(s.credits.topup)],
          [t('adminOps.creditSubGrant'), n(s.credits.subscriptionGrant)],
          [t('adminOps.creditSpent'), n(s.credits.spent)],
          [t('adminOps.creditExpired'), n(s.credits.expired)],
          [t('adminOps.creditAdminAdded'), n(s.credits.adminAdded)],
          [t('adminOps.creditAdminRemoved'), n(s.credits.adminRemoved)],
        ]}
      />
      <Stats
        title={t('adminOps.salesTitle')}
        rows={[
          [t('adminOps.salesPurchases'), n(s.sales.purchases)],
          [t('adminOps.salesCredits'), n(s.sales.credits)],
          [t('adminOps.salesGross'), formatMnt(s.sales.grossMnt)],
          [t('adminOps.salesTeacher'), formatMnt(s.sales.teacherEarningsMnt)],
          [t('adminOps.salesPlatform'), formatMnt(s.sales.platformMnt)],
        ]}
      />
    </div>
  );
}
