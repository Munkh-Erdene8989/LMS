'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminCommunityItem, AdminCommunityPage } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

type Kind = 'post' | 'comment';
type Status = 'ALL' | 'VISIBLE' | 'HIDDEN';
const KINDS: Kind[] = ['post', 'comment'];
const STATUSES: Status[] = ['ALL', 'VISIBLE', 'HIDDEN'];
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : t('auth.genericError'));

/** Community moderation: бүх багшийн сүүлийн нийтлэл/сэтгэгдлийг шалтгаантай нуух, сэргээх, устгах (audit-тай). */
export default function AdminCommunityPage() {
  const [kind, setKind] = useState<Kind>('post');
  const [status, setStatus] = useState<Status>('ALL');
  const [items, setItems] = useState<AdminCommunityItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = `kind=${kind}&status=${status}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<AdminCommunityPage>(`/admin/community/items?${query}`);
      setItems(r.data.items);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }, [query]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    try {
      const r = await api<AdminCommunityPage>(`/admin/community/items?${query}&before=${cursor}`);
      setItems((prev) => [...(prev ?? []), ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const replace = (item: AdminCommunityItem) => setItems((prev) => prev?.map((x) => (x.id === item.id ? item : x)) ?? null);
  const drop = (id: string) => setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('communityAdmin.title')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('communityAdmin.hint')}</p>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'btn' : 'btn btn-ghost'} onClick={() => setKind(k)}>
            {t(k === 'post' ? 'communityAdmin.tabPosts' : 'communityAdmin.tabComments')}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {STATUSES.map((s) => (
          <button key={s} className={s === status ? 'btn btn-small' : 'btn btn-ghost btn-small'} aria-pressed={s === status} onClick={() => setStatus(s)}>
            {t(`communityAdmin.status${s}` as MessageKey)}
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ margin: 0, color: 'var(--err)' }}>{error}</p>}
      {!items && !error && <p>{t('me.loading')}</p>}
      {items?.length === 0 && <p>{t('communityAdmin.empty')}</p>}
      {items?.map((i) => <ModerationRow key={i.id} item={i} onChange={replace} onDeleted={drop} />)}
      {cursor && (
        <button type="button" className="btn btn-ghost" onClick={() => void more()}>
          {t('admin.loadMore')}
        </button>
      )}
    </main>
  );
}

function ModerationRow({
  item: i,
  onChange,
  onDeleted,
}: {
  item: AdminCommunityItem;
  onChange: (i: AdminCommunityItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/admin/community/${i.kind === 'post' ? 'posts' : 'comments'}/${i.id}`;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const hide = () => {
    const reason = window.prompt(t('communityAdmin.hidePrompt'))?.trim();
    if (!reason) return;
    void run(async () => onChange((await api<AdminCommunityItem>(`${base}/hide`, { method: 'POST', body: { reason } })).data));
  };
  const unhide = () => void run(async () => onChange((await api<AdminCommunityItem>(`${base}/unhide`, { method: 'POST' })).data));
  const remove = () => {
    const reason = window.prompt(t('communityAdmin.deletePrompt'))?.trim();
    if (!reason || !window.confirm(t('communityAdmin.deleteConfirm'))) return;
    void run(async () => {
      await api(`${base}/delete`, { method: 'POST', body: { reason } });
      onDeleted(i.id);
    });
  };

  return (
    <section className="card" style={{ display: 'grid', gap: 6, opacity: i.hidden ? 0.8 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{i.author.name ?? t('community.unnamed')}</strong>
        <small className="muted">
          {formatDate(i.createdAt)}
          {i.editedAt && ` · ${t('community.edited', { date: formatDate(i.editedAt) })}`}
        </small>
        {i.hasImage && <span className="pill">{t('communityAdmin.hasImage')}</span>}
        {i.hidden && <span className="pill" style={{ color: 'var(--err)' }}>{t('communityAdmin.hiddenBadge')}</span>}
      </div>
      <small>
        {t('communityAdmin.community')}:{' '}
        <Link href={`/communities/${i.teacher.id}?post=${i.postId}`}>{i.teacher.name ?? t('community.unnamed')}</Link>
      </small>
      {i.body && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{i.body}</p>}
      {i.hidden && (
        <small className="muted">
          {t('communityAdmin.hiddenBy', {
            name: i.hidden.by?.name ?? t('admin.someone'),
            date: formatDate(i.hidden.at),
            reason: i.hidden.reason ?? '',
          })}
        </small>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {i.hidden ? (
          <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={unhide}>
            {t('communityAdmin.unhide')}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={hide}>
            {t('communityAdmin.hide')}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={remove}>
          {t('communityAdmin.delete')}
        </button>
      </div>
      {error && <small role="alert" style={{ color: 'var(--err)' }}>{error}</small>}
    </section>
  );
}
