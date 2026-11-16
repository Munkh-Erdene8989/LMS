'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry, AuditPage } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    const r = await api<AuditPage>(`/admin/audit?limit=50${before ? `&before=${before}` : ''}`);
    setItems((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
    setCursor(r.data.nextCursor);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('admin.auditTitle')}</h1>
      {!items && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('admin.auditEmpty')}</p>}
      {!!items?.length && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.when')}</th>
                <th>{t('admin.actor')}</th>
                <th>{t('admin.action')}</th>
                <th>{t('admin.target')}</th>
                <th>{t('admin.before')}</th>
                <th>{t('admin.after')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</td>
                  <td>{a.actor ? (a.actor.name ?? a.actor.id.slice(0, 8)) : t('admin.system')}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td>
                    {a.targetType}:{a.targetId.length > 20 ? `${a.targetId.slice(0, 8)}…` : a.targetId}
                  </td>
                  <td>
                    <code>{json(a.before)}</code>
                  </td>
                  <td>
                    <code>{json(a.after)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button className="btn btn-ghost" onClick={() => load(cursor)}>
          {t('admin.loadMore')}
        </button>
      )}
    </main>
  );
}

const json = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v));
