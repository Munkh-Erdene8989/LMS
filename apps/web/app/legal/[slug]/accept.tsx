'use client';

import { useEffect, useState } from 'react';
import type { LegalDocType, LegalStatus } from '@lms/shared';
import { api, errorText } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Button } from '../../ui/button';
import s from './legal.module.css';

/** Нэвтэрсэн хэрэглэгчид: одоогийн хувилбарыг зөвшөөрөх товч эсвэл зөвшөөрсөн огноо. */
export function AcceptLegal({ slug, type, version }: { slug: string; type: LegalDocType; version: number }) {
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LegalStatus[]>('/me/legal')
      .then((r) => setStatus(r.data.find((x) => x.type === type) ?? null))
      .catch(() => setStatus(null)); // нэвтрээгүй — товч харуулахгүй
  }, [type]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<LegalStatus>(`/legal/${slug}/accept`, { method: 'POST', body: { version } });
      setStatus(r.data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  if (status.upToDate && status.acceptedAt) {
    return (
      <div className={s.accept}>
        <p role="status" className={s.accepted}>
          {t('legal.accepted', { date: formatDate(status.acceptedAt) })}
        </p>
      </div>
    );
  }
  return (
    <div className={s.accept}>
      <Button loading={busy} onClick={() => void accept()}>
        {t('legal.accept')}
      </Button>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
