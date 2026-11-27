'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrgCourseGrantView, PrivateCourseOption } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../../ui/button';
import { useConfirm } from '../../../ui/confirm';
import { useToast } from '../../../ui/toast';
import { ErrorLine, LoadingRows, errorText } from '../../admin-ui';
import styles from '../../admin.module.css';

/**
 * Байгууллагын "Курсууд" таб (ticket 46): олгосон private курсүүд, сонгож олгох, confirm-той хасах.
 * Байгууллагын дэлгэрэнгүй хуудас (ticket 45) энэ компонентыг таб болгон шууд оруулна.
 */
export function OrgCoursesTab({ organizationId }: { organizationId: string }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [granted, setGranted] = useState<OrgCourseGrantView[] | null>(null);
  const [options, setOptions] = useState<PrivateCourseOption[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, o] = await Promise.all([
        api<OrgCourseGrantView[]>(`/admin/organizations/${organizationId}/courses`),
        api<PrivateCourseOption[]>('/admin/private-courses'),
      ]);
      setGranted(g.data);
      setOptions(o.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(fn: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      toast(done);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const grantedIds = new Set((granted ?? []).map((g) => g.courseId));
  const available = (options ?? []).filter((o) => !grantedIds.has(o.id));

  return (
    <div className={styles.stackLg}>
      <p className="muted">{t('orgCourses.intro')}</p>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!granted && !error && <LoadingRows />}

      {granted && (
        <form
          className={styles.formRow}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pick) return;
            if (await mutate(() => api(`/admin/organizations/${organizationId}/courses/${pick}`, { method: 'POST' }), t('orgCourses.granted'))) setPick('');
          }}
        >
          <select
            className="input"
            name="courseId"
            style={{ minWidth: 260 }}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label={t('orgCourses.pick')}
            disabled={available.length === 0}
          >
            <option value="">{available.length === 0 ? t('orgCourses.noneAvailable') : t('orgCourses.pickPlaceholder')}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
          <Button type="submit" loading={busy} disabled={!pick}>
            {t('orgCourses.grant')}
          </Button>
        </form>
      )}

      {granted?.length === 0 && <p className="muted">{t('orgCourses.empty')}</p>}
      {granted && granted.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('orgCourses.colCourse')}</th>
                <th scope="col">{t('orgCourses.colStatus')}</th>
                <th scope="col">{t('orgCourses.colGranted')}</th>
                <th scope="col">
                  <span className="sr-only">{t('adminUi.colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {granted.map((g) => (
                <tr key={g.courseId}>
                  <td>{g.title}</td>
                  <td>{t(`course.status${g.status}` as MessageKey)}</td>
                  <td>{formatDate(g.grantedAt)}</td>
                  <td className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('orgCourses.removeTitle'),
                          body: t('orgCourses.removeBody', { title: g.title }),
                          confirmLabel: t('orgCourses.remove'),
                          danger: true,
                        });
                        if (ok) await mutate(() => api(`/admin/organizations/${organizationId}/courses/${g.courseId}`, { method: 'DELETE' }), t('orgCourses.removed'));
                      }}
                    >
                      {t('orgCourses.remove')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
