'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { AdminUserPage, AdminUserRow } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, LoadingRows, Pill, errorText } from '../admin-ui';
import styles from '../admin.module.css';

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
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('adminOps.usersTitle')}</h1>
      <form onSubmit={submit} className={styles.toolbar} role="search">
        <input
          className={`input ${styles.grow}`}
          type="search"
          name="q"
          autoComplete="off"
          placeholder={t('adminOps.searchPlaceholder')}
          aria-label={t('adminOps.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit">{t('adminOps.search')}</Button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('adminOps.noUsers')} />}
      {items && items.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('adminOps.usersTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('adminUi.colUser')}</th>
                <th scope="col" className={styles.num}>
                  {t('adminOps.balanceCol')}
                </th>
                <th scope="col">{t('adminOps.registered')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <th scope="row" className={styles.wrap}>
                    <Link className={styles.anchor} href={`/admin/users/${u.id}`}>
                      {[u.name ?? t('admin.someone'), u.phone, u.email].filter(Boolean).join(' · ')}
                    </Link>
                    <span className={styles.pills}>
                      {u.roles.map((r) => (
                        <Pill key={r} tone="neutral">
                          {r}
                        </Pill>
                      ))}
                      {u.blockedAt && <Pill tone="err">{t('adminOps.blockedPill')}</Pill>}
                    </span>
                  </th>
                  <td className={styles.num}>{formatNumber(u.creditBalance)}</td>
                  <td className={styles.nowrap}>{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
