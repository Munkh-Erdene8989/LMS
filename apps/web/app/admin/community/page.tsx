'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminCommunityItem, AdminCommunityPage } from '@lms/shared';
import { api } from '@/lib/client-api';
import { formatDate } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { ErrorLine, FilterTabs, LoadingRows, Pill, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

type Kind = 'post' | 'comment';
type Status = 'ALL' | 'VISIBLE' | 'HIDDEN';
const KINDS: Kind[] = ['post', 'comment'];
const STATUSES: Status[] = ['ALL', 'VISIBLE', 'HIDDEN'];

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
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('communityAdmin.title')}</h1>
      <p className={styles.hint}>{t('communityAdmin.hint')}</p>
      <div className={styles.toolbar}>
        <FilterTabs
          label={t('communityAdmin.title')}
          value={kind}
          onChange={setKind}
          items={KINDS.map((k) => ({ key: k, label: t(k === 'post' ? 'communityAdmin.tabPosts' : 'communityAdmin.tabComments') }))}
        />
        <span className={styles.spacer} />
        <FilterTabs
          label={t('communityAdmin.title')}
          value={status}
          onChange={setStatus}
          items={STATUSES.map((s) => ({ key: s, label: t(`communityAdmin.status${s}` as MessageKey) }))}
        />
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!items && !error && <LoadingRows />}
      {items?.length === 0 && <EmptyState title={t('communityAdmin.empty')} />}
      {items?.map((i) => <ModerationRow key={i.id} item={i} onChange={replace} onDeleted={drop} />)}
      {cursor && (
        <div>
          <Button variant="secondary" onClick={() => void more()}>
            {t('admin.loadMore')}
          </Button>
        </div>
      )}
    </div>
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
  const [dialog, setDialog] = useState<'hide' | 'delete' | null>(null);
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

  const unhide = () => run(async () => onChange((await api<AdminCommunityItem>(`${base}/unhide`, { method: 'POST' })).data));

  return (
    <section className={`${styles.item} ${i.hidden ? styles.itemDim : ''}`}>
      <div className={styles.toolbar}>
        <strong>{i.author.name ?? t('community.unnamed')}</strong>
        <small className={styles.muted}>
          {formatDate(i.createdAt)}
          {i.editedAt && ` · ${t('community.edited', { date: formatDate(i.editedAt) })}`}
        </small>
        {i.hasImage && <Pill>{t('communityAdmin.hasImage')}</Pill>}
        {i.hidden && <Pill tone="err">{t('communityAdmin.hiddenBadge')}</Pill>}
      </div>
      <small>
        {t('communityAdmin.community')}:{' '}
        <Link className={styles.anchor} href={`/communities/${i.teacher.id}?post=${i.postId}`}>
          {i.teacher.name ?? t('community.unnamed')}
        </Link>
      </small>
      {i.body && <p className={`${styles.line} ${styles.pre}`}>{i.body}</p>}
      {i.hidden && (
        <small className={styles.muted}>
          {t('communityAdmin.hiddenBy', {
            name: i.hidden.by?.name ?? t('admin.someone'),
            date: formatDate(i.hidden.at),
            reason: i.hidden.reason ?? '',
          })}
        </small>
      )}
      <div className={styles.rowActions}>
        {i.hidden ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void unhide()}>
            {t('communityAdmin.unhide')}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialog('hide')}>
            {t('communityAdmin.hide')}
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialog('delete')}>
          {t('communityAdmin.delete')}
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <ReasonDialog
        open={dialog === 'hide'}
        onClose={() => setDialog(null)}
        title={t('communityAdmin.hide')}
        label={t('communityAdmin.hidePrompt')}
        confirmLabel={t('communityAdmin.hide')}
        onSubmit={(reason) =>
          run(async () => onChange((await api<AdminCommunityItem>(`${base}/hide`, { method: 'POST', body: { reason } })).data))
        }
      />
      <ReasonDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={t('communityAdmin.delete')}
        description={t('communityAdmin.deleteConfirm')}
        label={t('communityAdmin.deletePrompt')}
        confirmLabel={t('communityAdmin.delete')}
        danger
        onSubmit={(reason) =>
          run(async () => {
            await api(`${base}/delete`, { method: 'POST', body: { reason } });
            onDeleted(i.id);
          })
        }
      />
    </section>
  );
}
