'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, IdentifierType } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { OtpFlow } from '../otp-flow';

export default function MePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    api<AuthUser>('/me')
      .then((r) => load(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setStatus(t('auth.genericError'));
      });
  }, [router]);

  function load(u: AuthUser) {
    setUser(u);
    setName(u.name ?? '');
    setAvatarUrl(u.avatarUrl ?? '');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      const r = await api<AuthUser>('/me', {
        method: 'PATCH',
        body: { ...(name.trim() ? { name } : {}), avatarUrl: avatarUrl.trim() || null },
      });
      load(r.data);
      setStatus(t('me.saved'));
    } catch (err) {
      setStatus(err instanceof ApiRequestError && err.body?.message ? err.body.message : t('auth.genericError'));
    }
  }

  async function logout(all: boolean) {
    await api(all ? '/auth/logout-all' : '/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (!user) {
    return (
      <main className="page narrow">
        <p>{status ?? t('me.loading')}</p>
      </main>
    );
  }

  const missing: IdentifierType[] = (['PHONE', 'EMAIL'] as const).filter(
    (ty) => !user.identifiers.some((i) => i.type === ty),
  );

  return (
    <main className="page narrow" style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t('me.title')}</h1>

      <section className="card">
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('me.name')}
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('me.avatarUrl')}
            <input className="input" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
          </label>
          <button className="btn">{t('me.save')}</button>
          {status && <p style={{ margin: 0 }}>{status}</p>}
        </form>
      </section>

      <section className="card">
        <p style={{ marginTop: 0 }}>
          <strong>{t('me.roles')}:</strong> {user.roles.map((r) => t(`me.role${r}` as MessageKey)).join(', ')}
        </p>
        <strong>{t('me.identifiers')}</strong>
        <ul>
          {user.identifiers.map((i) => (
            <li key={i.type}>
              {i.type === 'PHONE' ? t('auth.phone') : t('auth.email')}: {i.value}{' '}
              <span style={{ color: 'var(--ok)' }}>✓ {t('me.verified')}</span>
            </li>
          ))}
        </ul>
        {linked && <p style={{ color: 'var(--ok)' }}>{t('me.linked')}</p>}
        {missing.length > 0 && (
          <>
            <strong>{missing[0] === 'PHONE' ? t('me.linkPhone') : t('me.linkEmail')}</strong>
            <div style={{ marginTop: 8 }}>
              <OtpFlow
                key={missing.join()}
                basePath="/me/identifiers"
                types={missing}
                onVerified={(u) => {
                  load(u);
                  setLinked(true);
                }}
              />
            </div>
          </>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!user.roles.includes('TEACHER') && (
          <a className="btn btn-ghost" href="/teacher/apply">
            {t('teacher.title')}
          </a>
        )}
        {user.roles.includes('ADMIN') && (
          <a className="btn" href="/admin">
            {t('admin.title')}
          </a>
        )}
        <button className="btn btn-ghost" onClick={() => logout(false)}>
          {t('me.logout')}
        </button>
        <button className="btn btn-ghost" onClick={() => logout(true)}>
          {t('me.logoutAll')}
        </button>
      </div>
    </main>
  );
}
