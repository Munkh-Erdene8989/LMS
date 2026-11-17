'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminReportSummary, ExpiredCreditsReport, ReportSection } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

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
    <main style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('adminOps.reportsTitle')}</h1>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>{t('adminOps.from')} <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('adminOps.to')} <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="submit" className="btn">{t('adminOps.show')}</button>
      </form>
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!summary && !error && <p>{t('me.loading')}</p>}
      {summary && (
        <>
          <h2 style={{ margin: 0 }}>{t('adminOps.liveSection')}</h2>
          <SectionView s={summary.live} />
          <p style={{ margin: 0 }}><strong>{t('adminOps.payoutsPaid', { amount: formatNumber(summary.payoutsPaidMnt) })}</strong></p>

          <h2 style={{ margin: 0 }}>{t('adminOps.topCourses')}</h2>
          {summary.topCourses.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('adminOps.noRows')}</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>{t('adminOps.colCourse')}</th><th>{t('adminOps.colTeacher')}</th><th>{t('adminOps.colPurchases')}</th><th>{t('adminOps.colCredits')}</th><th>{t('adminOps.colGross')}</th></tr></thead>
                <tbody>
                  {summary.topCourses.map((c) => (
                    <tr key={c.courseId}><td>{c.title}</td><td>{c.teacher.name ?? t('admin.someone')}</td><td>{formatNumber(c.purchases)}</td><td>{formatNumber(c.credits)}</td><td>{formatNumber(c.grossMnt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ margin: 0 }}>{t('adminOps.topTeachers')}</h2>
          {summary.topTeachers.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('adminOps.noRows')}</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>{t('adminOps.colTeacher')}</th><th>{t('adminOps.colSales')}</th><th>{t('adminOps.colGross')}</th><th>{t('adminOps.colEarnings')}</th></tr></thead>
                <tbody>
                  {summary.topTeachers.map((x) => (
                    <tr key={x.teacher.id}><td>{x.teacher.name ?? t('admin.someone')}</td><td>{formatNumber(x.sales)}</td><td>{formatNumber(x.grossMnt)}</td><td>{formatNumber(x.earningsMnt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="card" style={{ display: 'grid', gap: 12, borderStyle: 'dashed' }}>
            <h2 style={{ margin: 0 }}>{t('adminOps.testSection')}</h2>
            <SectionView s={summary.test} />
          </section>
        </>
      )}

      {expired && (
        <>
          <h2 style={{ margin: 0 }}>{t('adminOps.expiredTitle')}</h2>
          <p style={{ margin: 0 }}>
            {t('adminOps.expiredTotals', {
              credits: formatNumber(expired.live.credits),
              lots: formatNumber(expired.live.lots),
              testCredits: formatNumber(expired.test.credits),
              testLots: formatNumber(expired.test.lots),
            })}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {t('adminOps.upcoming', { live: formatNumber(expired.upcoming30d.live), test: formatNumber(expired.upcoming30d.test) })}
          </p>
          {expired.items.length === 0 ? <p>{t('adminOps.noExpired')}</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>{t('adminOps.colUser')}</th><th>{t('adminOps.colSource')}</th><th>{t('adminOps.colInitial')}</th><th>{t('adminOps.colExpired')}</th><th>{t('adminOps.colExpiresAt')}</th></tr></thead>
                <tbody>
                  {expired.items.map((r) => (
                    <tr key={r.lotId}>
                      <td>{[r.user.name ?? t('admin.someone'), r.user.phone, r.user.email].filter(Boolean).join(' · ')}{r.isTest && <span className="pill" style={{ marginLeft: 6 }}>{t('adminOps.testPill')}</span>}</td>
                      <td>{t(`adminOps.entry${r.source}` as MessageKey)}</td>
                      <td>{formatNumber(r.initial)}</td>
                      <td>{formatNumber(r.expiredCredits)}</td>
                      <td>{formatDate(r.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Stats({ title, rows }: { title: string; rows: [label: string, value: string][] }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 4, flex: '1 1 240px' }}>
      <strong>{title}</strong>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span className="muted">{l}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

function SectionView({ s }: { s: ReportSection }) {
  const n = formatNumber;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Stats
        title={t('adminOps.revenueTitle')}
        rows={[
          [t('adminOps.revenueTotal'), mnt(s.revenue.totalMnt)],
          [t('adminOps.revenueTopup'), mnt(s.revenue.topupMnt)],
          [t('adminOps.revenueSubscription'), mnt(s.revenue.subscriptionMnt)],
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
          [t('adminOps.salesGross'), mnt(s.sales.grossMnt)],
          [t('adminOps.salesTeacher'), mnt(s.sales.teacherEarningsMnt)],
          [t('adminOps.salesPlatform'), mnt(s.sales.platformMnt)],
        ]}
      />
    </div>
  );
}
