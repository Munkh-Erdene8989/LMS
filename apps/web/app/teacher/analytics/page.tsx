'use client';

import { useCallback, useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type {
  AnalyticsGranularity,
  CourseVideoAnalyticsView,
  DropOffBucket,
  SalesPoint,
  TeacherAnalyticsView,
} from '@lms/shared';
import { api, errorText, useApiFailure } from '@/lib/client-api';
import { formatMnt, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { EmptyValue } from '../../ui/empty-value';
import s from '../teacher.module.css';

type Metric = 'credits' | 'earningMnt' | 'sales';
const METRIC_LABEL: Record<Metric, MessageKey> = {
  credits: 'analytics.metricCredits',
  earningMnt: 'analytics.metricEarning',
  sales: 'analytics.metricSales',
};

const mnt = formatMnt;

/** Секунд → `м:сс` (цаг бол `ц:мм:сс`) */
function duration(sec: number | null): ReactNode {
  if (sec === null) return <EmptyValue />;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const sc = String(Math.floor(sec % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sc}` : `${m}:${sc}`;
}

/**
 * Багшийн аналитик (ticket 21): борлуулалтын график (өдөр/сар), attribution, курсийн дуусгалт,
 * lesson бүрийн худалдан авалт, видео үзэлт (Mux Data) ба зогсдог цэг. Огноо Улаанбаатарын цагаар.
 * Орлогын дэлгэрэнгүй, payout — `/teacher/earnings`; referral линк — `/teacher/referral`.
 */
export default function TeacherAnalyticsPage() {
  const fail = useApiFailure();
  const [view, setView] = useState<TeacherAnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metric, setMetric] = useState<Metric>('credits');

  const onError = useCallback(
    (err: unknown) => {
      const msg = fail(err);
      if (msg) setError(msg);
    },
    [fail],
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
      <div className={s.page}>
        <h1 className={s.title}>{t('analytics.title')}</h1>
        {error ? (
          <p role="alert" className={s.error}>
            {error}
          </p>
        ) : (
          <div className={s.stack} aria-busy="true" aria-label={t('ui.loading')}>
            <Skeleton height={88} radius={22} />
            <Skeleton height={260} radius={22} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.stack}>
        <h1 className={s.title}>{t('analytics.title')}</h1>
        <p className={s.lead}>{t('analytics.intro')}</p>
      </div>

      <form
        className={s.filters}
        onSubmit={(e) => {
          e.preventDefault();
          load({ granularity, from, to });
        }}
      >
        <label className={s.field}>
          {t('analytics.granularity')}
          <select
            className="input"
            name="granularity"
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
        <label className={s.field}>
          {t('analytics.from')}
          <input className="input" name="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={s.field}>
          {t('analytics.to')}
          <input className="input" name="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="submit">{t('analytics.apply')}</Button>
        {error && (
          <span role="alert" className={s.error}>
            {error}
          </span>
        )}
      </form>

      <div className={s.stats}>
        <Tile label={t('analytics.sales')} value={formatNumber(view.totals.sales)} />
        <Tile label={t('analytics.credits')} value={formatNumber(view.totals.credits)} />
        <Tile label={t('analytics.gross')} value={mnt(view.totals.grossMnt)} />
        <Tile label={t('analytics.earning')} value={mnt(view.totals.earningMnt)} />
        <section className={`card ${s.stat}`}>
          <span className={s.statLabel}>{t('analytics.balance')}</span>
          <strong className={s.statValue}>{mnt(view.balanceMnt)}</strong>
          <Link href="/teacher/earnings">{t('analytics.earningsLink')}</Link>
        </section>
      </div>
      {view.testSales.sales > 0 && (
        <p className={s.hint}>
          {t('analytics.testSales', { sales: formatNumber(view.testSales.sales), credits: formatNumber(view.testSales.credits) })}
        </p>
      )}

      <SalesChart series={view.series} metric={metric} onMetric={setMetric} />
      <Attribution view={view} />
      <Courses view={view} />
      <Lessons view={view} />
      <VideoSection view={view} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <section className={`card ${s.stat}`}>
      <span className={s.statLabel}>{label}</span>
      <strong className={s.statValue}>{value}</strong>
    </section>
  );
}

const fmtMetric = (m: Metric, v: number) => (m === 'earningMnt' ? mnt(v) : formatNumber(v));

/**
 * Нэг цуваа баганан график (plain SVG). Hover эсвэл keyboard (фокус → ←/→/Home/End, Esc) → tooltip
 * (`aria-live`); бүх өгөгдөл хүснэгтээр бас байна.
 */
function SalesChart({ series, metric, onMetric }: { series: SalesPoint[]; metric: Metric; onMetric: (m: Metric) => void }) {
  const tipId = useId();
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
  const label = t('analytics.chartTitle', { metric: t(METRIC_LABEL[metric]) });

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const last = series.length - 1;
    if (last < 0) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = hover === null ? 0 : Math.min(last, hover + 1);
    else if (e.key === 'ArrowLeft') next = hover === null ? last : Math.max(0, hover - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') {
      setHover(null);
      return;
    } else return;
    e.preventDefault();
    setHover(next);
  }

  return (
    <section className={`card ${s.card}`}>
      <div className={s.rowBetween}>
        <h2 className={s.sectionTitle}>{label}</h2>
        <div className={s.row} role="group" aria-label={t('analytics.metric')}>
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <Button key={m} size="sm" variant={m === metric ? 'primary' : 'secondary'} aria-pressed={m === metric} onClick={() => onMetric(m)}>
              {t(METRIC_LABEL[m])}
            </Button>
          ))}
        </div>
      </div>
      <div id={tipId} className={s.tooltip} aria-live="polite">
        {active ? (
          <span>
            <strong>{active.period}</strong> · {t('analytics.sales')}: {formatNumber(active.sales)} · {t('analytics.credits')}:{' '}
            {formatNumber(active.credits)} · {t('analytics.earning')}: {mnt(active.earningMnt)}
          </span>
        ) : (
          <span className="muted">{max === 0 ? t('analytics.chartEmpty') : `max ${fmtMetric(metric, max)} · ${t('teacherUi.chartKeyboardHint')}`}</span>
        )}
      </div>
      <svg
        className={s.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-roledescription={t('teacherUi.chartRole')}
        aria-label={label}
        aria-describedby={tipId}
        tabIndex={series.length ? 0 : -1}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} stroke="var(--border)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t} y2={PAD.t} stroke="var(--border)" strokeDasharray="2 4" />
        {series.map((p, i) => {
          const h = y(p[metric]);
          const x = PAD.l + i * slot + 1;
          const r = Math.min(4, barW / 2, h);
          const base = PAD.t + plotH;
          return (
            <g key={p.period} onMouseEnter={() => setHover(i)}>
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
      <details className={s.details}>
        <summary>{t('analytics.showTable')}</summary>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('analytics.period')}</th>
                <th scope="col" className={s.num}>
                  {t('analytics.sales')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.credits')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.gross')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.earning')}
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.period}>
                  <td>{p.period}</td>
                  <td className={s.num}>{formatNumber(p.sales)}</td>
                  <td className={s.num}>{formatNumber(p.credits)}</td>
                  <td className={s.num}>{mnt(p.grossMnt)}</td>
                  <td className={s.num}>{mnt(p.earningMnt)}</td>
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
    { key: 'REFERRAL' as const, color: 'var(--chart-1)', dot: s.dot1, v: view.attribution.REFERRAL },
    { key: 'PLATFORM' as const, color: 'var(--chart-2)', dot: s.dot2, v: view.attribution.PLATFORM },
  ];
  const total = parts.reduce((sum, p) => sum + p.v.sales, 0);
  let offset = 0;
  return (
    <section className={`card ${s.card}`}>
      <div className={s.rowBetween}>
        <h2 className={s.sectionTitle}>{t('analytics.attribution')}</h2>
        <Link href="/teacher/referral">{t('analytics.referralLink')}</Link>
      </div>
      {total === 0 ? (
        <p className={s.hint}>{t('analytics.attrEmpty')}</p>
      ) : (
        <>
          <svg
            className={s.attrBar}
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            role="img"
            aria-label={parts.map((p) => `${t(`analytics.attr${p.key}`)} ${Math.round((p.v.sales * 100) / total)}%`).join(', ')}
          >
            {parts.map((p) => {
              const w = (p.v.sales * 100) / total;
              const rect = p.v.sales ? <rect key={p.key} x={offset} width={Math.max(0, w - 0.5)} height={4} fill={p.color} /> : null;
              offset += w;
              return rect;
            })}
          </svg>
          <div className={s.stack}>
            {parts.map((p) => (
              <div key={p.key} className={s.legend}>
                <span className={`${s.dot} ${p.dot}`} aria-hidden="true" />
                <strong>
                  {t(`analytics.attr${p.key}`)} {Math.round((p.v.sales * 100) / total)}%
                </strong>
                <span className="muted">
                  {t('analytics.attrValue', {
                    sales: formatNumber(p.v.sales),
                    credits: formatNumber(p.v.credits),
                    earning: formatMnt(p.v.earningMnt),
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
    <section className={`card ${s.card}`}>
      <h2 className={s.sectionTitle}>{t('analytics.courses')}</h2>
      {view.courses.length === 0 ? (
        <p className={s.hint}>{t('analytics.noCourses')}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('analytics.course')}</th>
                <th scope="col" className={s.num}>
                  {t('analytics.courseSales')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.lessonSales')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.credits')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.earning')}
                </th>
                <th scope="col" className={s.num}>
                  {t('analytics.completion')}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.courses.map((c) => (
                <tr key={c.courseId}>
                  <td>{c.title}</td>
                  <td className={s.num}>{formatNumber(c.courseSales)}</td>
                  <td className={s.num}>{formatNumber(c.lessonSales)}</td>
                  <td className={s.num}>{formatNumber(c.credits)}</td>
                  <td className={s.num}>{mnt(c.earningMnt)}</td>
                  <td className={s.num}>
                    {c.completionPercent === null
                      ? <EmptyValue />
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
    <section className={`card ${s.card}`}>
      <h2 className={s.sectionTitle}>{t('analytics.lessons')}</h2>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t('analytics.lesson')}</th>
              <th scope="col">{t('analytics.course')}</th>
              <th scope="col" className={s.num}>
                {t('analytics.sales')}
              </th>
              <th scope="col" className={s.num}>
                {t('analytics.credits')}
              </th>
              <th scope="col" className={s.num}>
                {t('analytics.earning')}
              </th>
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
                <td className={s.num}>{formatNumber(l.sales)}</td>
                <td className={s.num}>{formatNumber(l.credits)}</td>
                <td className={s.num}>{mnt(l.earningMnt)}</td>
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
        .catch((err: unknown) => setError(errorText(err)))
        .finally(() => setLoading(false));
    },
    [from, to],
  );

  useEffect(() => load(courseId), [load, courseId]);

  if (view.courses.length === 0) return null;
  return (
    <section className={`card ${s.card}`}>
      <h2 className={s.sectionTitle}>{t('analytics.video')}</h2>
      <div className={s.filters}>
        <label className={s.field}>
          {t('analytics.videoCourse')}
          <select className="input" name="videoCourse" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {view.courses.map((c) => (
              <option key={c.courseId} value={c.courseId}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {loading && (
        <p className={s.hint} role="status">
          {t('me.loading')}
        </p>
      )}
      {data && !loading && (
        <>
          <small className="muted">{data.mux === 'OK' ? t('analytics.muxHint') : t(`analytics.mux${data.mux}` as MessageKey)}</small>
          {data.lessons.length === 0 ? (
            <p className={s.hint}>{t('analytics.videoNone')}</p>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('analytics.lesson')}</th>
                    <th scope="col" className={s.num}>
                      {t('analytics.duration')}
                    </th>
                    <th scope="col" className={s.num}>
                      {t('analytics.views')}
                    </th>
                    <th scope="col" className={s.num}>
                      {t('analytics.watchTime')}
                    </th>
                    <th scope="col" className={s.num}>
                      {t('analytics.avgWatch')}
                    </th>
                    <th scope="col" className={s.num}>
                      {t('analytics.learners')}
                    </th>
                    <th scope="col">{t('analytics.dropOff')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lessons.map((l) => (
                    <tr key={l.lessonId}>
                      <td>{l.title}</td>
                      <td className={s.num}>{duration(l.durationSeconds)}</td>
                      <td className={s.num}>{l.views === null ? <EmptyValue /> : formatNumber(l.views)}</td>
                      <td className={s.num}>{duration(l.watchTimeSeconds)}</td>
                      <td className={s.num}>{duration(l.avgWatchSecondsPerView)}</td>
                      <td className={s.num}>
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
  if (max === 0) return <EmptyValue />;
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
