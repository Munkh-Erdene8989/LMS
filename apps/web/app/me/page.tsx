'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, IdentifierType, NotificationPreferenceView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { OtpFlow } from '../otp-flow';
import { useUnsavedWarning } from '../teacher/use-unsaved';
import { Button, LinkButton } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Skeleton } from '../ui/skeleton';
import s from './me.module.css';

export default function MePage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [linked, setLinked] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferenceView[]>([]);
  const [prefError, setPrefError] = useState<string | null>(null);

  useEffect(() => {
    api<AuthUser>('/me')
      .then((r) => load(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
        else setStatus({ text: t('auth.genericError'), ok: false });
      });
  }, [router]);

  useEffect(() => {
    api<NotificationPreferenceView[]>('/notifications/preferences')
      .then((r) => setPrefs(r.data))
      .catch(() => undefined);
  }, []);

  const dirty = user !== null && (name !== (user.name ?? '') || avatarUrl !== (user.avatarUrl ?? ''));
  useUnsavedWarning(dirty && !saving);

  async function setPref(category: NotificationPreferenceView['category'], emailEnabled: boolean) {
    setPrefError(null);
    try {
      const r = await api<NotificationPreferenceView>(`/notifications/preferences/${category}`, { method: 'PUT', body: { emailEnabled } });
      setPrefs((prev) => prev.map((p) => (p.category === category ? r.data : p)));
    } catch {
      setPrefError(t('notifPrefs.saveError'));
    }
  }

  function load(u: AuthUser) {
    setUser(u);
    setName(u.name ?? '');
    setAvatarUrl(u.avatarUrl ?? '');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const r = await api<AuthUser>('/me', {
        method: 'PATCH',
        body: { ...(name.trim() ? { name } : {}), avatarUrl: avatarUrl.trim() || null },
      });
      load(r.data);
      setStatus({ text: t('me.saved'), ok: true });
    } catch (err) {
      setStatus({ text: err instanceof ApiRequestError && err.body?.message ? err.body.message : t('auth.genericError'), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function logout(all: boolean) {
    if (all) {
      const ok = await confirm({
        title: t('miscUi.logoutAllTitle'),
        body: t('miscUi.logoutAllBody'),
        confirmLabel: t('me.logoutAll'),
        danger: true,
      });
      if (!ok) return;
    }
    await api(all ? '/auth/logout-all' : '/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (!user) {
    return (
      <div className="page-narrow">
        {status && !status.ok ? (
          <p role="alert" className={s.error}>
            {status.text}
          </p>
        ) : (
          <div className={s.skeletons} aria-busy="true" aria-label={t('me.loading')}>
            <Skeleton width="50%" height="2.25rem" />
            <Skeleton height="220px" radius="22px" />
            <Skeleton height="140px" radius="22px" />
          </div>
        )}
      </div>
    );
  }

  const missing: IdentifierType[] = (['PHONE', 'EMAIL'] as const).filter(
    (ty) => !user.identifiers.some((i) => i.type === ty),
  );
  const isTeacher = user.roles.includes('TEACHER');
  const previewUrl = /^https?:\/\//i.test(avatarUrl.trim()) ? avatarUrl.trim() : null;

  return (
    <div className="page-narrow">
      <div className={s.stack}>
        <h1 className={s.title}>{t('me.title')}</h1>

        <section className={`card ${s.section}`} aria-labelledby="me-profile">
          <h2 id="me-profile" className={s.sectionTitle}>
            {t('miscUi.profile')}
          </h2>
          <div className={s.profileHead}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={s.avatar} src={previewUrl} alt="" width={72} height={72} />
            ) : (
              <span className={`${s.avatar} ${s.initial}`} aria-hidden="true">
                {(name.trim() || user.name || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className={s.hint}>
              <strong>{t('me.roles')}:</strong> {user.roles.map((r) => t(`me.role${r}` as MessageKey)).join(', ')}
            </p>
          </div>
          <form onSubmit={save} className={s.form}>
            <label className={s.field}>
              {t('me.name')}
              <input
                className="input"
                name="name"
                autoComplete="name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className={s.field}>
              {t('me.avatarUrl')}
              <input
                className="input"
                name="avatarUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </label>
            <div className={s.formActions}>
              <Button type="submit" loading={saving} loadingLabel={t('miscUi.saving')} disabled={!dirty}>
                {t('me.save')}
              </Button>
              {status && (
                <p role={status.ok ? 'status' : 'alert'} className={`${s.status} ${status.ok ? '' : s.statusError}`}>
                  {status.text}
                </p>
              )}
            </div>
          </form>
        </section>

        <section className={`card ${s.section}`} aria-labelledby="me-identifiers">
          <h2 id="me-identifiers" className={s.sectionTitle}>
            {t('me.identifiers')}
          </h2>
          <ul className={s.identifiers}>
            {user.identifiers.map((i) => (
              <li key={i.type} className={s.identifier}>
                <span>
                  <span className={s.identifierKind}>{i.type === 'PHONE' ? t('auth.phone') : t('auth.email')}</span>
                  <br />
                  <span className={s.identifierValue}>{i.value}</span>
                </span>
                <span className={s.verified}>
                  <span aria-hidden="true">✓</span> {t('me.verified')}
                </span>
              </li>
            ))}
          </ul>
          {linked && (
            <p role="status" className={s.status}>
              {t('me.linked')}
            </p>
          )}
          {missing.length > 0 && (
            <div className={s.linkBox}>
              <h3 className={s.sectionTitle}>{missing[0] === 'PHONE' ? t('me.linkPhone') : t('me.linkEmail')}</h3>
              <p className={s.hint}>{t('miscUi.linkHint')}</p>
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
          )}
        </section>

        {prefs.length > 0 && (
          <section className="card">
            <fieldset className={s.prefs}>
              <legend>{t('notifPrefs.title')}</legend>
              <p className={s.hint}>{t('notifPrefs.hint')}</p>
              {prefs.map((p) => (
                <label key={p.category} className={s.check}>
                  <input type="checkbox" checked={p.emailEnabled} onChange={(e) => void setPref(p.category, e.target.checked)} />
                  <span>
                    {t(`notifPrefs.${p.category}` as MessageKey)} — <span className={s.hint}>{t('notifPrefs.email')}</span>
                  </span>
                </label>
              ))}
              {prefError && (
                <p role="alert" className={s.error}>
                  {prefError}
                </p>
              )}
            </fieldset>
          </section>
        )}

        <nav className={s.actions} aria-label={t('miscUi.accountLinks')}>
          {isTeacher && <LinkButton href="/teacher/courses">{t('course.myCourses')}</LinkButton>}
          {isTeacher && (
            <LinkButton variant="secondary" href="/teacher/analytics">
              {t('analytics.nav')}
            </LinkButton>
          )}
          {isTeacher && (
            <LinkButton variant="secondary" href="/teacher/earnings">
              {t('earnings.title')}
            </LinkButton>
          )}
          {isTeacher && (
            <LinkButton variant="secondary" href="/teacher/referral">
              {t('referral.nav')}
            </LinkButton>
          )}
          {!isTeacher && (
            <LinkButton variant="secondary" href="/teacher/apply">
              {t('teacher.title')}
            </LinkButton>
          )}
          {user.roles.includes('ADMIN') && <LinkButton href="/admin">{t('admin.title')}</LinkButton>}
        </nav>
        <div className={s.actions}>
          <Button variant="ghost" onClick={() => void logout(false)}>
            {t('me.logout')}
          </Button>
          <Button variant="ghost" onClick={() => void logout(true)}>
            {t('me.logoutAll')}
          </Button>
        </div>
      </div>
    </div>
  );
}
