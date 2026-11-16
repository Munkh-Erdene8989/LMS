'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryNode } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

export default function AdminCategoriesPage() {
  const [tree, setTree] = useState<CategoryNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<CategoryNode[]>('/categories').then((r) => setTree(r.data));
  }, []);

  async function run(fn: () => Promise<{ data: CategoryNode[] }>) {
    setError(null);
    try {
      setTree((await fn()).data);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t('auth.genericError'));
      return false;
    }
  }

  const rename = (c: CategoryNode) => {
    const name = window.prompt(t('course.rename'), c.name);
    if (name?.trim()) void run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { name } }));
  };
  const remove = (c: CategoryNode) => {
    if (window.confirm(t('course.removeConfirm'))) void run(() => api(`/admin/categories/${c.id}`, { method: 'DELETE' }));
  };

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('course.categories')}</h1>
      {error && <p style={{ color: 'var(--err)', margin: 0 }}>{error}</p>}
      {!tree && <p>{t('me.loading')}</p>}
      {tree?.map((c) => (
        <section key={c.id} className="card" style={{ display: 'grid', gap: 8 }}>
          <div className="lesson-row" style={{ fontWeight: 700 }}>
            <span>
              {c.name} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>/{c.slug}</small>
            </span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button className="btn-icon" onClick={() => rename(c)}>
                {t('course.rename')}
              </button>
              <button className="btn-icon" onClick={() => remove(c)}>
                {t('course.remove')}
              </button>
            </span>
          </div>
          <ul className="lesson-list">
            {c.children.map((ch) => (
              <li key={ch.id} className="lesson-row">
                <span>
                  {ch.name} <small style={{ color: 'var(--muted)' }}>/{ch.slug}</small>
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-icon" onClick={() => rename(ch)}>
                    {t('course.rename')}
                  </button>
                  <button className="btn-icon" onClick={() => remove(ch)}>
                    {t('course.remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <AddCategory parentId={c.id} placeholder={t('course.newChild')} run={run} />
        </section>
      ))}
      {tree && <AddCategory parentId={null} placeholder={t('course.newRoot')} run={run} />}
    </main>
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
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input
        className="input"
        style={{ flex: '1 1 200px' }}
        required
        maxLength={100}
        placeholder={placeholder}
        aria-label={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn btn-ghost">{t('course.add')}</button>
    </form>
  );
}
