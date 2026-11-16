'use client';

import { useEffect, useState } from 'react';
import type { LegalDocType, LegalStatus } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

/** Нэвтэрсэн хэрэглэгчид: одоогийн хувилбарыг зөвшөөрөх товч эсвэл зөвшөөрсөн огноо. */
export function AcceptLegal({ slug, type, version }: { slug: string; type: LegalDocType; version: number }) {
  const [status, setStatus] = useState<LegalStatus | null>(null);

  useEffect(() => {
    api<LegalStatus[]>('/me/legal')
      .then((r) => setStatus(r.data.find((s) => s.type === type) ?? null))
      .catch(() => setStatus(null)); // нэвтрээгүй — товч харуулахгүй
  }, [type]);

  if (!status) return null;
  if (status.upToDate && status.acceptedAt) {
    return <p style={{ color: 'var(--ok)' }}>{t('legal.accepted', { date: formatDate(status.acceptedAt) })}</p>;
  }
  return (
    <p>
      <button
        className="btn"
        onClick={async () => {
          const r = await api<LegalStatus>(`/legal/${slug}/accept`, { method: 'POST', body: { version } });
          setStatus(r.data);
        }}
      >
        {t('legal.accept')}
      </button>
    </p>
  );
}
