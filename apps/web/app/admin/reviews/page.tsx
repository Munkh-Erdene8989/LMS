'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminReviewPage, AdminReviewView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Stars } from '../../courses/[id]/reviews-ui';

type Status = 'ALL' | 'VISIBLE' | 'HIDDEN';
const STATUSES: Status[] = ['ALL', 'VISIBLE', 'HIDDEN'];
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Үнэлгээний moderation: зохисгүй үнэлгээ/хариултыг шалтгаантай нуух, сэргээх (audit-тай). */
export default function AdminReviewsPage() {
  const [status, setStatus] = useState<Status>('ALL');
  const [items, setItems] = useState<AdminReviewView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<AdminReviewPage>(`/admin/reviews?status=${status}`);
      setItems(r.data.items);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }, [status]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<AdminReviewPage>(`/admin/reviews?status=${status}&before=${cursor}`);
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const replace = (r: AdminReviewView) => setItems((prev) => prev?.map((x) => (x.id === r.id ? r : x)) ?? null);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('review.adminTitle')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('review.adminHint')}</p>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={s === status} className={s === status ? 'btn' : 'btn btn-ghost'} onClick={() => setStatus(s)}>
            {t(`review.tab${s}` as MessageKey)}
          </button>
        ))}
      </div>
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!items && !error && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('review.adminEmpty')}</p>}
      {items?.map((r) => <ReviewModeration key={r.id} review={r} onChange={replace} />)}
      {cursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('admin.loadMore')}
        </button>
      )}
    </main>
  );
}

function ReviewModeration({ review: r, onChange }: { review: AdminReviewView; onChange: (r: AdminReviewView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      onChange((await api<AdminReviewView>(path, { method: 'POST', body })).data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const hide = (path: string, confirmText?: string) => {
    const reason = window.prompt(t('review.hideReason'))?.trim();
    if (!reason) return;
    if (confirmText && !window.confirm(confirmText)) return;
    void act(path, { reason });
  };

  return (
    <section className="card" style={{ display: 'grid', gap: 6, opacity: r.hidden ? 0.8 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars rating={r.rating} />
        <strong>{r.author.name}</strong>
        <small className="muted">
          {formatDate(r.createdAt)}
          {r.editedAt && ` · ${t('review.edited')}`}
        </small>
        {r.hidden && <span className="pill" style={{ color: 'var(--err)' }}>{t('review.hiddenBadge')}</span>}
      </div>
      <small>
        {t('review.course')}: <Link href={`/courses/${r.course.id}#review-${r.id}`}>{r.course.title}</Link>
      </small>
      {r.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>}
      {r.hidden && (
        <small className="muted">
          {t('review.hiddenBy', {
            name: r.hiddenBy?.name ?? t('admin.someone'),
            date: r.hiddenAt ? formatDate(r.hiddenAt) : '',
            reason: r.hiddenReason ?? '',
          })}
        </small>
      )}
      <div>
        {r.hidden ? (
          <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => void act(`/admin/reviews/${r.id}/unhide`)}>
            {t('review.unhide')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy}
            onClick={() => hide(`/admin/reviews/${r.id}/hide`, t('review.hideConfirm'))}
          >
            {t('review.hide')}
          </button>
        )}
      </div>
      {r.replies.length > 0 && (
        <div style={{ display: 'grid', gap: 6, borderLeft: '3px solid var(--border, #e5e7eb)', paddingLeft: 12 }}>
          {r.replies.map((x) => (
            <div key={x.id} style={{ opacity: x.hidden ? 0.7 : 1 }}>
              <small>
                <strong>{x.author.name}</strong>
                {x.byTeacher && <span className="pill" style={{ marginLeft: 6 }}>{t('review.teacherBadge')}</span>}
                <span className="muted"> · {formatDate(x.createdAt)}</span>
                {x.hidden && (
                  <span className="pill" style={{ marginLeft: 6, color: 'var(--err)' }}>
                    {t('review.hiddenBadge')}
                    {x.hiddenReason && ` · ${x.hiddenReason}`}
                  </span>
                )}
              </small>
              <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>{x.body}</p>
              {x.hidden ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => void act(`/admin/reviews/replies/${x.id}/unhide`)}
                >
                  {t('review.unhide')}
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => hide(`/admin/reviews/replies/${x.id}/hide`)}>
                  {t('review.hide')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <small role="alert" style={{ color: 'var(--err)' }}>{error}</small>}
    </section>
  );
}
