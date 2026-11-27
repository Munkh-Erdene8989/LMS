'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrgCourseGrantView, OrgReport } from '@lms/shared';
import { api, apiDownload } from '@/lib/client-api';
import { formatDate, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button } from '../../../ui/button';
import { EmptyState } from '../../../ui/empty-state';
import { ErrorLine, LoadingRows, Pill, errorText } from '../../admin-ui';
import styles from '../../admin.module.css';

/** Байгууллагын "Тайлан" таб (ticket 48): гишүүн × курсийн явц, курсээр шүүх, хасагдсан гишүүн, CSV татах. */
export function OrgReportTab({ organizationId }: { organizationId: string }) {
  const [courses, setCourses] = useState<OrgCourseGrantView[]>([]);
  const [courseId, setCourseId] = useState('');
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [report, setReport] = useState<OrgReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const query = (() => {
    const q = new URLSearchParams();
    if (courseId) q.set('courseId', courseId);
    if (includeRemoved) q.set('includeRemoved', 'true');
    const s = q.toString();
    return s ? `?${s}` : '';
  })();

  useEffect(() => {
    api<OrgCourseGrantView[]>(`/admin/organizations/${organizationId}/courses`)
      .then((r) => setCourses(r.data))
      .catch((err) => setError(errorText(err)));
  }, [organizationId]);

  const load = useCallback(async () => {
    setReport(null);
    setError(null);
    try {
      setReport((await api<OrgReport>(`/admin/organizations/${organizationId}/report${query}`)).data);
    } catch (err) {
      setError(errorText(err));
    }
  }, [organizationId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      await apiDownload(`/admin/organizations/${organizationId}/report.csv${query}`, `org-report-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  const dash = t('orgReport.noValue');

  return (
    <div className={styles.stackLg}>
      <div className={styles.formRow}>
        <select className="input" style={{ minWidth: 240 }} value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label={t('orgReport.course')}>
          <option value="">{t('orgReport.allCourses')}</option>
          {courses.map((c) => (
            <option key={c.courseId} value={c.courseId}>
              {c.title}
            </option>
          ))}
        </select>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={includeRemoved} onChange={(e) => setIncludeRemoved(e.target.checked)} />
          {t('orgReport.includeRemoved')}
        </label>
        <Button onClick={() => void exportCsv()} loading={exporting}>
          {t('orgReport.exportCsv')}
        </Button>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}
      {!report && !error && <LoadingRows />}
      {report && report.rows.length === 0 && <EmptyState title={t('orgReport.empty')} />}
      {report && report.rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{t('orgAdmin.tabReport')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('orgReport.colPerson')}</th>
                <th scope="col">{t('orgReport.colCourse')}</th>
                <th scope="col">{t('orgReport.colProgress')}</th>
                <th scope="col">{t('orgReport.colQuiz')}</th>
                <th scope="col">{t('orgReport.colCertificate')}</th>
                <th scope="col">{t('orgReport.colLastActive')}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const who = [r.phone, r.email].filter(Boolean).join(' · ');
                return (
                  <tr key={`${r.memberId}:${r.courseId}`}>
                    <th scope="row" className={styles.wrap}>
                      {r.name ?? who}
                      {r.name && <small className={styles.muted}> {who}</small>}{' '}
                      {r.removed && <Pill tone="neutral">{t('orgReport.removed')}</Pill>}
                    </th>
                    <td className={styles.wrap}>{r.courseTitle}</td>
                    <td className={styles.nowrap}>
                      {formatNumber(r.progressPercent)}%{' '}
                      <small className={styles.muted}>{t('orgReport.progressOf', { done: formatNumber(r.completedLessonCount), total: formatNumber(r.lessonCount) })}</small>
                    </td>
                    <td className={styles.nowrap}>{r.quizAveragePercent === null ? dash : `${formatNumber(r.quizAveragePercent)}%`}</td>
                    <td className={styles.nowrap}>
                      {r.certificateCode ? (
                        <>
                          {r.certificateCode} <small className={styles.muted}>{formatDate(r.certificateIssuedAt!)}</small>
                        </>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className={styles.nowrap}>{r.lastActivityAt ? formatDate(r.lastActivityAt) : dash}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
