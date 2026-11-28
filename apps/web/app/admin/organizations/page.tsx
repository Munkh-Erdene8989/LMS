'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OrgAdminRow } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { LinkButton } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, LoadingRows, Pill, errorText } from '../admin-ui';
import styles from '../admin.module.css';
import { ORG_STATUS_TONE } from './org-status';

export default function AdminOrganizationsPage() {
  const [items, setItems] = useState<OrgAdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgAdminRow[]>('/admin/organizations')
      .then((r) => setItems(r.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('orgAdmin.title')}</h1>
      <div className={styles.toolbar}>
        <LinkButton href="/admin/organizations/new">{t('orgAdmin.newButton')}</LinkButton>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('orgAdmin.none')} />}
      {items && items.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('orgAdmin.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('orgAdmin.colName')}</th>
                <th scope="col">{t('orgAdmin.colStatus')}</th>
                <th scope="col" className={styles.num}>
                  {t('orgAdmin.colMembers')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('orgAdmin.colSeats')}
                </th>
                <th scope="col">{t('orgAdmin.colContract')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className={styles.wrap}>
                    <Link className={styles.anchor} href={`/admin/organizations/${o.id}`}>
                      {o.name}
                    </Link>
                  </th>
                  <td>
                    <Pill tone={ORG_STATUS_TONE[o.status]}>{t(`orgAdmin.status${o.status}` as MessageKey)}</Pill>
                  </td>
                  <td className={styles.num}>{formatNumber(o.memberCount)}</td>
                  <td className={styles.num}>
                    {t('orgAdmin.seatsUsed', { used: formatNumber(o.memberCount + o.pendingCount), limit: formatNumber(o.seatLimit) })}
                  </td>
                  <td className={styles.nowrap}>{formatDate(o.contractEndsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
