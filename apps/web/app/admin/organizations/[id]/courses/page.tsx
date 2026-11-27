'use client';

import { use } from 'react';
import { t } from '@/lib/i18n';
import styles from '../../../admin.module.css';
import { OrgCoursesTab } from '../org-courses-tab';

/** `/admin/organizations/:id/courses` — "Курсууд" таб (ticket 46). Ticket 45-ын дэлгэрэнгүй хуудас ижил компонентыг таб болгон оруулна. */
export default function OrganizationCoursesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className={styles.stackLg}>
      <h1 className={styles.title}>{t('orgCourses.title')}</h1>
      <OrgCoursesTab organizationId={id} />
    </div>
  );
}
