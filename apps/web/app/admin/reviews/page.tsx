'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminReviewPage, AdminReviewView } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Stars } from '../../courses/[id]/reviews-ui';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, FilterTabs, LoadingRows, Pill, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

type Status = 'ALL' | 'VISIBLE' | 'HIDDEN';
const STATUSES: Status[] = ['ALL', 'VISIBLE', 'HIDDEN'];

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
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('review.adminTitle')}</h1>
      <p className={styles.hint}>{t('review.adminHint')}</p>
      <FilterTabs
        label={t('review.adminTitle')}
        value={status}
        onChange={setStatus}
        items={STATUSES.map((s) => ({ key: s, label: t(`review.tab${s}` as MessageKey) }))}
      />
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('review.adminEmpty')} />}
      {items?.map((r) => <ReviewModeration key={r.id} review={r} onChange={replace} />)}
      {cursor && (
        <div>
          <Button variant="secondary" onClick={() => void more()}>
            {t('admin.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewModeration({ review: r, onChange }: { review: AdminReviewView; onChange: (r: AdminReviewView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Нуух гэж буй зам (review эсвэл reply). */
  const [hiding, setHiding] = useState<{ path: string; isReview: boolean } | null>(null);

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

  return (
    <section className={`${styles.item} ${r.hidden ? styles.itemDim : ''}`}>
      <div className={styles.toolbar}>
        <Stars rating={r.rating} />
        <strong>{r.author.name}</strong>
        <small className={styles.muted}>
          {formatDate(r.createdAt)}
          {r.editedAt && ` · ${t('review.edited')}`}
        </small>
        {r.hidden && <Pill tone="err">{t('review.hiddenBadge')}</Pill>}
      </div>
      <small>
        {t('review.course')}:{' '}
        <Link className={styles.anchor} href={`/courses/${r.course.id}#review-${r.id}`}>
          {r.course.title}
        </Link>
      </small>
      {r.body && <p className={`${styles.line} ${styles.pre}`}>{r.body}</p>}
      {r.hidden && (
        <small className={styles.muted}>
          {t('review.hiddenBy', {
            name: r.hiddenBy?.name ?? t('admin.someone'),
            date: r.hiddenAt ? formatDate(r.hiddenAt) : '',
            reason: r.hiddenReason ?? '',
          })}
        </small>
      )}
      <div>
        {r.hidden ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/admin/reviews/${r.id}/unhide`)}>
            {t('review.unhide')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setHiding({ path: `/admin/reviews/${r.id}/hide`, isReview: true })}>
            {t('review.hide')}
          </Button>
        )}
      </div>
      {r.replies.length > 0 && (
        <div className={styles.replies}>
          {r.replies.map((x) => (
            <div key={x.id} className={x.hidden ? styles.itemDim : undefined}>
              <small>
                <strong>{x.author.name}</strong>
                {x.byTeacher && (
                  <span className={styles.pills}>
                    <Pill>{t('review.teacherBadge')}</Pill>
                  </span>
                )}
                <span className={styles.muted}> · {formatDate(x.createdAt)}</span>
                {x.hidden && (
                  <span className={styles.pills}>
                    <Pill tone="err">
                      {t('review.hiddenBadge')}
                      {x.hiddenReason && ` · ${x.hiddenReason}`}
                    </Pill>
                  </span>
                )}
              </small>
              <p className={`${styles.line} ${styles.pre}`}>{x.body}</p>
              {x.hidden ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/admin/reviews/replies/${x.id}/unhide`)}>
                  {t('review.unhide')}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setHiding({ path: `/admin/reviews/replies/${x.id}/hide`, isReview: false })}
                >
                  {t('review.hide')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ReasonDialog
        open={hiding !== null}
        onClose={() => setHiding(null)}
        title={t('review.hide')}
        description={hiding?.isReview ? t('review.hideConfirm') : undefined}
        label={t('review.hideReason')}
        confirmLabel={t('review.hide')}
        danger
        onSubmit={async (reason) => {
          if (hiding) await act(hiding.path, { reason });
        }}
      />
    </section>
  );
}
