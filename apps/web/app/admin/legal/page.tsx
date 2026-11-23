'use client';

import { useCallback, useEffect, useState } from 'react';
import { LEGAL_DOC_TYPES, LEGAL_SLUGS, type LegalDocType, type LegalDocView } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { useToast } from '../../ui/toast';
import { ErrorLine, FilterTabs, LoadingRows, errorText } from '../admin-ui';
import styles from '../admin.module.css';

export default function AdminLegalPage() {
  const [type, setType] = useState<LegalDocType>('TERMS');
  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('admin.legalTitle')}</h1>
      <FilterTabs
        label={t('admin.legalTitle')}
        value={type}
        onChange={setType}
        items={LEGAL_DOC_TYPES.map((ty) => ({ key: ty, label: t(`legal.${ty}`) }))}
      />
      <LegalEditor key={type} type={type} />
    </div>
  );
}

function LegalEditor({ type }: { type: LegalDocType }) {
  const slug = LEGAL_SLUGS[type];
  const confirm = useConfirm();
  const toast = useToast();
  const [versions, setVersions] = useState<LegalDocView[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const draft = versions?.find((v) => !v.publishedAt) ?? null;

  const load = useCallback(async () => {
    const r = await api<LegalDocView[]>(`/admin/legal/${slug}`);
    setVersions(r.data);
    const d = r.data.find((v) => !v.publishedAt);
    const base = d ?? r.data[0];
    setTitle(base?.title ?? t(`legal.${type}`));
    setBody(base?.body ?? '');
  }, [slug, type]);

  useEffect(() => {
    load().catch((err: unknown) => setError(errorText(err)));
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await load();
      toast.toast(t('admin.saved'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = () =>
    run(() =>
      draft
        ? api(`/admin/legal/documents/${draft.id}`, { method: 'PATCH', body: { title, body } })
        : api(`/admin/legal/${slug}`, { method: 'POST', body: { title, body } }),
    );

  async function publish() {
    if (!draft) return;
    const ok = await confirm({ title: t('admin.publish'), body: t('admin.publishConfirm'), confirmLabel: t('admin.publish'), danger: true });
    if (ok) await run(() => api(`/admin/legal/documents/${draft.id}/publish`, { method: 'POST' }));
  }

  if (!versions) return error ? <ErrorLine>{error}</ErrorLine> : <LoadingRows />;

  return (
    <div className={styles.stackLg}>
      <section className={styles.item} aria-label={draft ? t('admin.draft') : t('admin.newDraft')}>
        <strong>{draft ? `${t('admin.draft')} · ${t('admin.version', { version: draft.version })}` : t('admin.newDraft')}</strong>
        <label className={styles.field}>
          {t('admin.docTitle')}
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          {t('admin.docBody')}
          <textarea className={`input ${styles.textareaTall}`} rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className={styles.rowActions}>
          <Button variant="secondary" onClick={() => void saveDraft()} disabled={!title.trim() || !body.trim()} loading={busy}>
            {t('admin.saveDraft')}
          </Button>
          {draft && <Button onClick={() => void publish()}>{t('admin.publish')}</Button>}
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
      </section>

      <section className={styles.stack} aria-labelledby="legal-versions">
        <h2 id="legal-versions" className={styles.subtitle}>
          {t('admin.versions')}
        </h2>
        {versions.length === 0 && <p className={styles.hint}>{t('admin.noVersions')}</p>}
        <ul className={styles.stack}>
          {versions.map((v) => (
            <li key={v.id}>
              {t('admin.version', { version: v.version })} — {v.title} ·{' '}
              {v.publishedAt ? (
                <a className={styles.anchor} href={`/legal/${slug}?version=${v.version}`} target="_blank" rel="noreferrer">
                  {t('admin.published', { date: formatDate(v.publishedAt) })}
                </a>
              ) : (
                t('admin.draft')
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
