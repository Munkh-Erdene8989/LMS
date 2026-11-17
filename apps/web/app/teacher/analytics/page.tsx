'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AnalyticsGranularity,
  CourseVideoAnalyticsView,
  DropOffBucket,
  SalesPoint,
  TeacherAnalyticsView,
} from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

type Metric = 'credits' | 'earningMnt' | 'sales';
const METRIC_LABEL: Record<Metric, MessageKey> = {
  credits: 'analytics.metricCredits',
  earningMnt: 'analytics.metricEarning',
  sales: 'analytics.metricSales',
};

const mnt = (n: number) => t('earnings.mnt', { amount: formatNumber(n) });

/** Секунд → `м:сс` (цаг бол `ц:мм:сс`) */
function duration(sec: number | null): string {
  if (sec === null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Багшийн аналитик (ticket 21): борлуулалтын график (өдөр/сар), attribution, курсийн дуусгалт,
 * lesson бүрийн худалдан авалт, видео үзэлт (Mux Data) ба зогсдог цэг. Огноо Улаанбаатарын цагаар.
 * Орлогын дэлгэрэнгүй, payout — `/teacher/earnings`; referral линк — `/teacher/referral`.
 */
export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const [view, setView] = useState<TeacherAnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metric, setMetric] = useState<Metric>('credits');

  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 401) router.replace('/login?next=/teacher/analytics');
      else setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
    },
    [router],
  );

  const load = useCallback(
    (q: { granularity: AnalyticsGranularity; from?: string; to?: string }) => {
      const params = new URLSearchParams({ granularity: q.granularity });
      if (q.from) params.set('from', q.from);
      if (q.to) params.set('to', q.to);
      setError(null);
      api<TeacherAnalyticsView>(`/teacher/analytics?${params.toString()}`)
        .then((r) => {
          setView(r.data);
          setFrom(r.data.range.from);
          setTo(r.data.range.to);
        })
        .catch(onError);
    },
    [onError],
  );

  useEffect(() => load({ granularity: 'day' }), [load]);

  if (!view) {
    return (
      <main className="page">
        <p>{error ?? t('me.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page wide" style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('analytics.title')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('analytics.intro')}
        </p>
      </div>

      <form
        className="filter-row"
        onSubmit={(e) => {
          e.preventDefault();
          load({ granularity, from, to });
        }}
      >
        <label>
          {t('analytics.granularity')}
          <select
            className="input"
            value={granularity}
            onChange={(e) => {
              const g = e.target.value as AnalyticsGranularity;
              setGranularity(g);
              load({ granularity: g }); // алхам солиход анхдагч хүрээ
            }}
          >
            <option value="day">{t('analytics.day')}</option>
            <option value="month">{t('analytics.month')}</option>
          </select>
        </label>
        <label>
          {t('analytics.from')}
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('analytics.to')}
          <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn">
          {t('analytics.apply')}
        </button>
        {error && <span style={{ color: 'var(--err)' }}>{error}</span>}
      </form>

      <div className="stat-tiles">
        <Tile label={t('analytics.sales')} value={formatNumber(view.totals.sales)} />
        <Tile label={t('analytics.credits')} value={formatNumber(view.totals.credits)} />
        <Tile label={t('analytics.gross')} value={mnt(view.totals.grossMnt)} />
        <Tile label={t('analytics.earning')} value={mnt(view.totals.earningMnt)} />
        <section className="card stat-tile">
          <span className="muted">{t('analytics.balance')}</span>
          <strong>{mnt(view.balanceMnt)}</strong>
          <a href="/teacher/earnings" style={{ fontSize: 13 }}>
            {t('analytics.earningsLink')}
          </a>
        </section>
      </div>
      {view.testSales.sales > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t('analytics.testSales', { sales: formatNumber(view.testSales.sales), credits: formatNumber(view.testSales.credits) })}
        </p>
      )}

      <SalesChart series={view.series} metric={metric} onMetric={setMetric} />
      <Attribution view={view} />
      <Courses view={view} />
      <Lessons view={view} />
      <VideoSection view={view} />
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <section className="card stat-tile">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

const fmtMetric = (m: Metric, v: number) => (m === 'earningMnt' ? mnt(v) : formatNumber(v));

/** Нэг цуваа баганан график (plain SVG). Hover/focus → tooltip; хүснэгтээр харах боломжтой. */
function SalesChart({ series, metric, onMetric }: { series: SalesPoint[]; metric: Metric; onMetric: (m: Metric) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const PAD = { l: 8, r: 8, t: 8, b: 22 };
  const values = series.map((p) => p[metric]);
  const max = Math.max(...values, 0);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = series.length ? plotW / series.length : plotW;
  const barW = Math.max(1, slot - 2); // 2px зай
  const y = (v: number) => (max ? (v / max) * plotH : 0);
  // X тэнхлэгт ~8 шошго
  const every = Math.max(1, Math.ceil(series.length / 8));
  const active = hover !== null ? series[hover] : null;

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>{t('analytics.chartTitle', { metric: t(METRIC_LABEL[metric]) })}</strong>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label={t('analytics.metric')}>
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              className={m === metric ? 'btn btn-small' : 'btn btn-ghost btn-small'}
              aria-pressed={m === metric}
              onClick={() => onMetric(m)}
            >
              {t(METRIC_LABEL[m])}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-tooltip">
        {active ? (
          <span>
            <strong>{active.period}</strong> · {t('analytics.sales')}: {formatNumber(active.sales)} · {t('analytics.credits')}:{' '}
            {formatNumber(active.credits)} · {t('analytics.earning')}: {mnt(active.earningMnt)}
          </span>
        ) : (
          <span className="muted">{max === 0 ? t('analytics.chartEmpty') : `max ${fmtMetric(metric, max)}`}</span>
        )}
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('analytics.chartTitle', { metric: t(METRIC_LABEL[metric]) })} onMouseLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} stroke="var(--border)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t} y2={PAD.t} stroke="var(--border)" strokeDasharray="2 4" />
        {series.map((p, i) => {
          const h = y(p[metric]);
          const x = PAD.l + i * slot + 1;
          const r = Math.min(4, barW / 2, h);
          const base = PAD.t + plotH;
          return (
            <g key={p.period} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              {/* Hit target — баганаас том */}
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`}
                  fill="var(--chart-1)"
                  opacity={hover === null || hover === i ? 1 : 0.5}
                />
              )}
              {i % every === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle">
                  {p.period.length === 10 ? p.period.slice(5) : p.period}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="muted">{t('analytics.showTable')}</summary>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('analytics.period')}</th>
                <th className="num">{t('analytics.sales')}</th>
                <th className="num">{t('analytics.credits')}</th>
                <th className="num">{t('analytics.gross')}</th>
                <th className="num">{t('analytics.earning')}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.period}>
                  <td>{p.period}</td>
                  <td className="num">{formatNumber(p.sales)}</td>
                  <td className="num">{formatNumber(p.credits)}</td>
                  <td className="num">{mnt(p.grossMnt)}</td>
                  <td className="num">{mnt(p.earningMnt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Attribution({ view }: { view: TeacherAnalyticsView }) {
  const parts = [
    { key: 'REFERRAL' as const, color: 'var(--chart-1)', v: view.attribution.REFERRAL },
    { key: 'PLATFORM' as const, color: 'var(--chart-2)', v: view.attribution.PLATFORM },
  ];
  const total = parts.reduce((s, p) => s + p.v.sales, 0);
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{t('analytics.attribution')}</strong>
        <a href="/teacher/referral" style={{ fontSize: 13 }}>
          {t('analytics.referralLink')}
        </a>
      </div>
      {total === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('analytics.attrEmpty')}
        </p>
      ) : (
        <>
          <div className="attr-bar" role="img" aria-label={parts.map((p) => `${t(`analytics.attr${p.key}`)} ${Math.round((p.v.sales * 100) / total)}%`).join(', ')}>
            {parts.map((p) =>
              p.v.sales ? <span key={p.key} style={{ flex: p.v.sales, background: p.color }} title={`${t(`analytics.attr${p.key}`)}: ${p.v.sales}`} /> : null,
            )}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {parts.map((p) => (
              <div key={p.key} style={{ fontSize: 14 }}>
                <span className="legend-dot" style={{ background: p.color }} />
                <strong>
                  {t(`analytics.attr${p.key}`)} {Math.round((p.v.sales * 100) / total)}%
                </strong>{' '}
                <span className="muted">
                  {t('analytics.attrValue', {
                    sales: formatNumber(p.v.sales),
                    credits: formatNumber(p.v.credits),
                    earning: formatNumber(p.v.earningMnt),
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Courses({ view }: { view: TeacherAnalyticsView }) {
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t('analytics.courses')}</h2>
      {view.courses.length === 0 ? (
        <p style={{ margin: 0 }}>{t('analytics.noCourses')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('analytics.course')}</th>
                <th className="num">{t('analytics.courseSales')}</th>
                <th className="num">{t('analytics.lessonSales')}</th>
                <th className="num">{t('analytics.credits')}</th>
                <th className="num">{t('analytics.earning')}</th>
                <th className="num">{t('analytics.completion')}</th>
              </tr>
            </thead>
            <tbody>
              {view.courses.map((c) => (
                <tr key={c.courseId}>
                  <td>{c.title}</td>
                  <td className="num">{formatNumber(c.courseSales)}</td>
                  <td className="num">{formatNumber(c.lessonSales)}</td>
                  <td className="num">{formatNumber(c.credits)}</td>
                  <td className="num">{mnt(c.earningMnt)}</td>
                  <td className="num">
                    {c.completionPercent === null
                      ? '—'
                      : t('analytics.completionValue', {
                          percent: c.completionPercent,
                          done: formatNumber(c.completedLearners),
                          total: formatNumber(c.learners),
                        })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <small className="muted">{t('analytics.completionHint')}</small>
    </section>
  );
}

function Lessons({ view }: { view: TeacherAnalyticsView }) {
  const titles = new Map(view.courses.map((c) => [c.courseId, c.title]));
  if (view.lessons.length === 0) return null;
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t('analytics.lessons')}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('analytics.lesson')}</th>
              <th>{t('analytics.course')}</th>
              <th className="num">{t('analytics.sales')}</th>
              <th className="num">{t('analytics.credits')}</th>
              <th className="num">{t('analytics.earning')}</th>
            </tr>
          </thead>
          <tbody>
            {view.lessons.map((l) => (
              <tr key={l.lessonId}>
                <td>
                  {l.title}
                  {l.archived && <small className="muted"> · {t('analytics.archived')}</small>}
                </td>
                <td>{titles.get(l.courseId) ?? ''}</td>
                <td className="num">{formatNumber(l.sales)}</td>
                <td className="num">{formatNumber(l.credits)}</td>
                <td className="num">{mnt(l.earningMnt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Курсийн видео аналитик — Mux Data руу хүсэлт явуулдаг тул курс сонгоход л ачаална. */
function VideoSection({ view }: { view: TeacherAnalyticsView }) {
  const [courseId, setCourseId] = useState(view.courses[0]?.courseId ?? '');
  const [data, setData] = useState<CourseVideoAnalyticsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = view.range;

  const load = useCallback(
    (id: string) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      api<CourseVideoAnalyticsView>(`/teacher/analytics/courses/${id}/video?from=${from}&to=${to}`)
        .then((r) => setData(r.data))
        .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : t('auth.genericError')))
        .finally(() => setLoading(false));
    },
    [from, to],
  );

  useEffect(() => load(courseId), [load, courseId]);

  if (view.courses.length === 0) return null;
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0 }}>{t('analytics.video')}</h2>
      <div className="filter-row">
        <label>
          {t('analytics.videoCourse')}
          <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {view.courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}
      {loading && <p className="muted" style={{ margin: 0 }}>{t('me.loading')}</p>}
      {data && !loading && (
        <>
          <small className="muted">
            {data.mux === 'OK' ? t('analytics.muxHint') : t(`analytics.mux${data.mux}` as MessageKey)}
          </small>
          {data.lessons.length === 0 ? (
            <p style={{ margin: 0 }}>{t('analytics.videoNone')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('analytics.lesson')}</th>
                    <th className="num">{t('analytics.duration')}</th>
                    <th className="num">{t('analytics.views')}</th>
                    <th className="num">{t('analytics.watchTime')}</th>
                    <th className="num">{t('analytics.avgWatch')}</th>
                    <th className="num">{t('analytics.learners')}</th>
                    <th>{t('analytics.dropOff')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lessons.map((l) => (
                    <tr key={l.lessonId}>
                      <td>{l.title}</td>
                      <td className="num">{duration(l.durationSeconds)}</td>
                      <td className="num">{l.views === null ? '—' : formatNumber(l.views)}</td>
                      <td className="num">{duration(l.watchTimeSeconds)}</td>
                      <td className="num">{duration(l.avgWatchSecondsPerView)}</td>
                      <td className="num">
                        {formatNumber(l.learners)}
                        {l.learners > 0 && <small className="muted"> ({formatNumber(l.completedLearners)} ✓)</small>}
                      </td>
                      <td>
                        <DropOff buckets={l.dropOff} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <small className="muted">{t('analytics.dropOffHint')}</small>
        </>
      )}
    </section>
  );
}

/** 10 баганатай жижиг histogram (0–100%) */
function DropOff({ buckets }: { buckets: DropOffBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.learners), 0);
  const W = 120;
  const H = 28;
  const slot = W / buckets.length;
  if (max === 0) return <span className="muted">—</span>;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={buckets.map((b) => `${b.fromPercent}%: ${b.learners}`).join(', ')}>
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--border)" />
      {buckets.map((b, i) => {
        const h = (b.learners / max) * (H - 2);
        return (
          <rect key={b.fromPercent} x={i * slot + 1} y={H - h} width={slot - 2} height={h} rx={1} fill="var(--chart-1)">
            <title>
              {t('analytics.dropOffBar', { from: b.fromPercent, to: b.fromPercent === 90 ? 100 : b.fromPercent + 9, count: b.learners })}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
