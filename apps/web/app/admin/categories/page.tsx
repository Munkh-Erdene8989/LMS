'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryNode } from '@lms/shared';
import { api } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { Button } from '../../ui/button';
import { useConfirm } from '../../ui/confirm';
import { ErrorLine, LoadingRows, ReasonDialog, errorText } from '../admin-ui';
import styles from '../admin.module.css';

export default function AdminCategoriesPage() {
  const confirm = useConfirm();
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<CategoryNode | null>(null);

  useEffect(() => {
    api<CategoryNode[]>('/categories')
      .then((r) => setTree(r.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  async function run(fn: () => Promise<{ data: CategoryNode[] }>) {
    setError(null);
    try {
      setTree((await fn()).data);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  const remove = async (c: CategoryNode) => {
    const ok = await confirm({ title: t('course.removeConfirm'), body: c.name, confirmLabel: t('course.remove'), danger: true });
    if (ok) await run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }));
  };

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('course.categories')}</h1>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!tree && !error && <LoadingRows />}
      {tree?.map((c) => (
        <section key={c.id} className={styles.item} aria-label={c.name}>
          <CategoryRow node={c} strong onRename={setRenaming} onRemove={remove} />
          <ul className={styles.stack}>
            {c.children.map((ch) => (
              <li key={ch.id}>
                <CategoryRow node={ch} onRename={setRenaming} onRemove={remove} />
              </li>
            ))}
          </ul>
          <AddCategory parentId={c.id} placeholder={t('course.newChild')} run={run} />
        </section>
      ))}
      {tree && <AddCategory parentId={null} placeholder={t('course.newRoot')} run={run} />}
      <ReasonDialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('course.rename')}
        label={t('course.rename')}
        confirmLabel={t('admin.save')}
        initialValue={renaming?.name ?? ''}
        maxLength={100}
        multiline={false}
        onSubmit={async (name) => {
          if (renaming) await run(() => api(`/admin/categories/${renaming.id}`, { method: 'PATCH', body: { name } }));
        }}
      />
    </div>
  );
}

function CategoryRow({
  node,
  strong,
  onRename,
  onRemove,
}: {
  node: CategoryNode;
  strong?: boolean;
  onRename: (c: CategoryNode) => void;
  onRemove: (c: CategoryNode) => void;
}) {
  return (
    <div className={styles.itemHead}>
      <span>
        {strong ? <strong>{node.name}</strong> : node.name} <small className={styles.muted}>/{node.slug}</small>
      </span>
      <span className={styles.rowActions}>
        <Button variant="ghost" size="sm" onClick={() => onRename(node)}>
          {t('course.rename')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onRemove(node)}>
          {t('course.remove')}
        </Button>
      </span>
    </div>
  );
}

function AddCategory({
  parentId,
  placeholder,
  run,
}: {
  parentId: string | null;
  placeholder: string;
  run: (fn: () => Promise<{ data: CategoryNode[] }>) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api('/admin/categories', { method: 'POST', body: { name, parentId } }))) setName('');
  }
  return (
    <form onSubmit={submit} className={styles.formRow}>
      <input
        className={`input ${styles.grow}`}
        required
        maxLength={100}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" variant="secondary">
        {t('course.add')}
      </Button>
    </form>
  );
}
