'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, AuditPage } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { EmptyValue } from '../../ui/empty-value';
import { ErrorLine, LoadingRows, errorText } from '../admin-ui';
import styles from '../admin.module.css';

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (before?: string) => {
    setError(null);
    try {
      const r = await api<AuditPage>(`/admin/audit?limit=50${before ? `&before=${before}` : ''}`);
      setItems((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    await load(cursor);
    setLoadingMore(false);
  }

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('admin.auditTitle')}</h1>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('admin.auditEmpty')} />}
      {!!items?.length && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('admin.auditTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.when')}</th>
                <th scope="col">{t('admin.actor')}</th>
                <th scope="col">{t('admin.action')}</th>
                <th scope="col">{t('admin.target')}</th>
                <th scope="col">{t('admin.before')}</th>
                <th scope="col">{t('admin.after')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className={styles.nowrap}>{formatDate(a.createdAt)}</td>
                  <td>{a.actor ? (a.actor.name ?? a.actor.id.slice(0, 8)) : t('admin.system')}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td>
                    {a.targetType}:{a.targetId.length > 20 ? `${a.targetId.slice(0, 8)}…` : a.targetId}
                  </td>
                  <td className={styles.wrap}>
                    <code>{json(a.before)}</code>
                  </td>
                  <td className={styles.wrap}>
                    <code>{json(a.after)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <div>
          <Button variant="secondary" loading={loadingMore} onClick={() => void more()}>
            {t('admin.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

const json = (v: unknown) => (v === null || v === undefined ? <EmptyValue /> : JSON.stringify(v));
