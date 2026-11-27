'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrgAdminRow } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import styles from '../../admin.module.css';
import { OrgForm, draftBody, emptyDraft } from '../org-form';

export default function NewOrganizationPage() {
  const router = useRouter();
  return (
    <div className={styles.stackLg}>
      <Link href="/admin/organizations" className={`${styles.back} ${styles.anchor}`}>
        {t('orgAdmin.back')}
      </Link>
      <h1 className={styles.title}>{t('orgAdmin.titleNew')}</h1>
      <OrgForm
        initial={emptyDraft()}
        submitLabel={t('orgAdmin.create')}
        onSubmit={async (d) => {
          const r = await api<OrgAdminRow>('/admin/organizations', { method: 'POST', body: draftBody(d) });
          router.push(`/admin/organizations/${r.data.id}`);
        }}
      />
    </div>
  );
}
