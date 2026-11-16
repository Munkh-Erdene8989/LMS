'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationItem, NotificationPage } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

const changed = () => window.dispatchEvent(new Event('notifications:changed'));

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (before?: string) => {
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
    await api('/notifications/read-all', { method: 'POST' });
    const now = new Date().toISOString();
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? now })) ?? null);
    changed();
  }

  const hasUnread = items?.some((i) => !i.readAt);

  return (
    <main className="page" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{t('notifications.title')}</h1>
        {hasUnread && (
          <button className="btn btn-ghost" onClick={readAll}>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {error && <p style={{ color: 'var(--err)' }}>{t('auth.genericError')}</p>}
      {!items && !error && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p style={{ color: 'var(--muted)' }}>{t('notifications.empty')}</p>}

      {!!items?.length && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {items.map((n) => (
            <li key={n.id}>
              <button className={`notification ${n.readAt ? '' : 'unread'}`} onClick={() => open(n)}>
                <strong>{n.title}</strong>
                <span>{n.body}</span>
                <time dateTime={n.createdAt} style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {new Date(n.createdAt).toLocaleString('mn-MN')}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button className="btn btn-ghost" onClick={() => load(cursor)}>
          {t('notifications.loadMore')}
        </button>
      )}
    </main>
  );
}
