'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationItem, NotificationPage } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import s from './notifications.module.css';

const changed = () => window.dispatchEvent(new Event('notifications:changed'));

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      setError(false);
      try {
        const r = await api<NotificationPage>(`/notifications?limit=20${before ? `&before=${before}` : ''}`);
        setItems((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
        setCursor(r.data.nextCursor);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setError(true);
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? null);
      changed();
    }
    if (n.link) router.push(n.link);
  }

  async function readAll() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? now })) ?? null);
      changed();
    } finally {
      setBusy(false);
    }
  }

  async function more(before: string) {
    setLoadingMore(true);
    await load(before);
    setLoadingMore(false);
  }

  const hasUnread = items?.some((i) => !i.readAt);

  return (
    <div className="page-narrow">
      <div className={s.head}>
        <h1 className={s.title}>{t('notifications.title')}</h1>
        {hasUnread && (
          <Button variant="secondary" loading={busy} onClick={() => void readAll()}>
            {t('notifications.markAllRead')}
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className={s.error}>
          <p>{t('auth.genericError')}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t('miscUi.retry')}
          </Button>
        </div>
      )}

      {!items && !error && (
        <div className={s.list} aria-busy="true" aria-label={t('me.loading')}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.row}>
              <span className={s.skeletonText}>
                <Skeleton width="45%" />
                <Skeleton width="80%" height="0.9em" />
              </span>
            </div>
          ))}
        </div>
      )}

      {items?.length === 0 && <EmptyState title={t('notifications.empty')} description={t('miscUi.notificationsEmptyHint')} />}

      {!!items?.length && (
        <ul className={s.list}>
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className={`${s.item} ${n.readAt ? '' : s.unread}`} onClick={() => void open(n)}>
                <span className={s.dot} aria-hidden="true" />
                <span className={s.itemTitle}>
                  {n.title}
                  {!n.readAt && <span className={s.tag}>{t('miscUi.unreadTag')}</span>}
                </span>
                <span className={s.body}>{n.body}</span>
                <time className={s.time} dateTime={n.createdAt} title={formatDate(n.createdAt)}>
                  {formatRelative(n.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div className={s.more}>
          <Button variant="secondary" loading={loadingMore} onClick={() => void more(cursor)}>
            {t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
