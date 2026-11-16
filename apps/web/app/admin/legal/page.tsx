'use client';

import { useCallback, useEffect, useState } from 'react';
import { LEGAL_DOC_TYPES, LEGAL_SLUGS, type LegalDocType, type LegalDocView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

export default function AdminLegalPage() {
  const [type, setType] = useState<LegalDocType>('TERMS');
  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('admin.legalTitle')}</h1>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {LEGAL_DOC_TYPES.map((ty) => (
          <button
            key={ty}
            role="tab"
            aria-selected={type === ty}
            className={type === ty ? 'btn' : 'btn btn-ghost'}
            onClick={() => setType(ty)}
          >
            {t(`legal.${ty}`)}
          </button>
        ))}
      </div>
      <LegalEditor key={type} type={type} />
    </main>
  );
}

function LegalEditor({ type }: { type: LegalDocType }) {
  const slug = LEGAL_SLUGS[type];
  const [versions, setVersions] = useState<LegalDocView[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, okText: string) {
    setMessage(null);
    try {
      await action();
      await load();
      setMessage({ ok: true, text: okText });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiRequestError ? err.message : t('auth.genericError') });
    }
  }

  const saveDraft = () =>
    run(
      () =>
        draft
          ? api(`/admin/legal/documents/${draft.id}`, { method: 'PATCH', body: { title, body } })
          : api(`/admin/legal/${slug}`, { method: 'POST', body: { title, body } }),
      t('admin.saved'),
    );

  const publish = () => {
    if (!draft || !window.confirm(t('admin.publishConfirm'))) return;
    void run(() => api(`/admin/legal/documents/${draft.id}/publish`, { method: 'POST' }), t('admin.saved'));
  };

  if (!versions) return <p>{t('me.loading')}</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="card" style={{ display: 'grid', gap: 8 }}>
        <strong>{draft ? `${t('admin.draft')} · ${t('admin.version', { version: draft.version })}` : t('admin.newDraft')}</strong>
        <label style={{ display: 'grid', gap: 4 }}>
          {t('admin.docTitle')}
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          {t('admin.docBody')}
          <textarea
            className="input"
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={saveDraft} disabled={!title.trim() || !body.trim()}>
            {t('admin.saveDraft')}
          </button>
          {draft && (
            <button className="btn" onClick={publish}>
              {t('admin.publish')}
            </button>
          )}
          {message && <span style={{ color: message.ok ? 'var(--ok)' : 'var(--err)' }}>{message.text}</span>}
        </div>
      </section>

      <section>
        <strong>{t('admin.versions')}</strong>
        {versions.length === 0 && <p>{t('admin.noVersions')}</p>}
        <ul>
          {versions.map((v) => (
            <li key={v.id}>
              {t('admin.version', { version: v.version })} — {v.title} ·{' '}
              {v.publishedAt ? (
                <a href={`/legal/${slug}?version=${v.version}`} target="_blank" rel="noreferrer">
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
