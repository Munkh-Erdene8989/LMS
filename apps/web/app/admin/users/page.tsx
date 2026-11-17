'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { AdminUserPage, AdminUserRow } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Хэрэглэгч хайх (утас, имэйл, нэр). */
export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [items, setItems] = useState<AdminUserRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const r = await api<AdminUserPage>(`/admin/users?q=${encodeURIComponent(applied)}`);
      setItems(r.data.items);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<AdminUserPage>(`/admin/users?q=${encodeURIComponent(applied)}&before=${cursor}`);
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setApplied(q.trim());
  }

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('adminOps.usersTitle')}</h1>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: '1 1 260px' }}
          placeholder={t('adminOps.searchPlaceholder')}
          aria-label={t('adminOps.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn">
          {t('adminOps.search')}
        </button>
      </form>
      {error && <p style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!items && !error && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('adminOps.noUsers')}</p>}
      {items && items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('payout.teacher')}</th>
                <th>{t('adminOps.balanceCol')}</th>
                <th>{t('adminOps.registered')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`}>
                      {[u.name ?? t('admin.someone'), u.phone, u.email].filter(Boolean).join(' · ')}
                    </Link>
                    {u.roles.map((r) => (
                      <span key={r} className="pill" style={{ marginLeft: 6 }}>
                        {r}
                      </span>
                    ))}
                    {u.blockedAt && (
                      <span className="pill" style={{ marginLeft: 6, color: 'var(--err)' }}>
                        {t('adminOps.blockedPill')}
                      </span>
                    )}
                  </td>
                  <td>{formatNumber(u.creditBalance)}</td>
                  <td>{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('admin.loadMore')}
        </button>
      )}
    </main>
  );
}
