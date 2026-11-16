'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BANKS, type BankAccountView, type BankCode, type MyTeacherApplication } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';

interface Form {
  displayName: string;
  bio: string;
  expertise: string;
  sampleUrl: string;
  bank: BankCode | '';
  accountNumber: string;
  holderName: string;
}

const empty: Form = { displayName: '', bio: '', expertise: '', sampleUrl: '', bank: '', accountNumber: '', holderName: '' };

export default function TeacherApplyPage() {
  const router = useRouter();
  const [data, setData] = useState<MyTeacherApplication | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function load(d: MyTeacherApplication) {
    setData(d);
    const a = d.application;
    const b = d.bankAccount;
    setForm({
      displayName: a?.displayName ?? '',
      bio: a?.bio ?? '',
      expertise: a?.expertise ?? '',
      sampleUrl: a?.sampleUrl ?? '',
      bank: b?.bank ?? '',
      accountNumber: b?.accountNumber ?? '',
      holderName: b?.holderName ?? '',
    });
    setAgreed(false);
  }

  useEffect(() => {
    api<MyTeacherApplication>('/teacher/application')
      .then((r) => load(r.data))
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.status === 401) router.replace('/login');
      });
  }, [router]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data?.currentAgreementVersion) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<MyTeacherApplication>('/teacher/application', {
        method: 'POST',
        body: {
          displayName: form.displayName,
          bio: form.bio,
          expertise: form.expertise,
          sampleUrl: form.sampleUrl,
          agreementVersion: data.currentAgreementVersion,
          bankAccount: { bank: form.bank, accountNumber: form.accountNumber, holderName: form.holderName },
        },
      });
      load(r.data);
      window.dispatchEvent(new Event('notifications:changed'));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiRequestError ? err.message : t('auth.genericError') });
    } finally {
      setBusy(false);
    }
  }

  async function saveBank(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const r = await api<BankAccountView>('/teacher/bank-account', {
        method: 'PUT',
        body: { bank: form.bank, accountNumber: form.accountNumber, holderName: form.holderName },
      });
      setData((d) => (d ? { ...d, bankAccount: r.data } : d));
      setMessage({ ok: true, text: t('teacher.bankSaved') });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiRequestError ? err.message : t('auth.genericError') });
    }
  }

  if (!data) return <main className="page narrow">{t('me.loading')}</main>;

  const app = data.application;
  const canSubmit = data.hasVerifiedPhone && !data.isTeacher && data.currentAgreementVersion !== null && app?.status !== 'SUBMITTED';
  const status = data.isTeacher ? 'APPROVED' : app?.status;

  const bankFields = (
    <fieldset style={{ display: 'grid', gap: 8, border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 8 }}>{t('teacher.bankTitle')}</legend>
      <label style={{ display: 'grid', gap: 4 }}>
        {t('teacher.bank')}
        <select className="input" required value={form.bank} onChange={set('bank')}>
          <option value="" disabled>
            {t('teacher.chooseBank')}
          </option>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {t(`banks.${b}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        {t('teacher.accountNumber')}
        <input className="input" required inputMode="numeric" value={form.accountNumber} onChange={set('accountNumber')} />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        {t('teacher.holderName')}
        <input className="input" required maxLength={120} value={form.holderName} onChange={set('holderName')} />
      </label>
    </fieldset>
  );

  return (
    <main className="page narrow" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t('teacher.title')}</h1>
        <p style={{ color: 'var(--muted)' }}>{t('teacher.intro')}</p>
      </div>

      {status && (
        <section className="card" style={{ borderColor: status === 'REJECTED' ? 'var(--err)' : undefined }}>
          <strong style={{ color: status === 'APPROVED' ? 'var(--ok)' : status === 'REJECTED' ? 'var(--err)' : undefined }}>
            {t(`teacher.status${status}` as MessageKey)}
          </strong>
          {status === 'REJECTED' && app?.reviewNote && (
            <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
              <strong>{t('teacher.reason')}:</strong> {app.reviewNote}
            </p>
          )}
          {app && (
            <p style={{ marginBottom: 0, color: 'var(--muted)', fontSize: 14 }}>
              {t('teacher.agreementAccepted', { version: app.agreementVersion, date: formatDate(app.agreementAcceptedAt) })}
            </p>
          )}
        </section>
      )}

      {!data.hasVerifiedPhone && (
        <section className="card">
          <p style={{ marginTop: 0 }}>{t('teacher.phoneRequired')}</p>
          <Link className="btn" href="/me">
            {t('teacher.goLinkPhone')}
          </Link>
        </section>
      )}
      {data.hasVerifiedPhone && data.currentAgreementVersion === null && !data.isTeacher && (
        <p className="card">{t('teacher.agreementMissing')}</p>
      )}

      {canSubmit && (
        <form className="card" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('teacher.displayName')}
            <input className="input" required maxLength={120} value={form.displayName} onChange={set('displayName')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('teacher.bio')}
            <textarea className="input" required rows={5} maxLength={5000} value={form.bio} onChange={set('bio')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('teacher.expertise')}
            <input className="input" required maxLength={500} value={form.expertise} onChange={set('expertise')} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('teacher.sampleUrl')}
            <input className="input" required type="url" pattern="https://.*" value={form.sampleUrl} onChange={set('sampleUrl')} />
          </label>
          {bankFields}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
            <span>
              {t('teacher.agreementRead', { version: data.currentAgreementVersion! })}{' '}
              <a href="/legal/teacher-agreement" target="_blank" rel="noreferrer">
                {t('teacher.readAgreement')}
              </a>
            </span>
          </label>
          <button className="btn" disabled={!agreed || busy}>
            {busy ? t('teacher.submitting') : app?.status === 'REJECTED' ? t('teacher.resubmit') : t('teacher.submit')}
          </button>
          {message && <p style={{ margin: 0, color: message.ok ? 'var(--ok)' : 'var(--err)' }}>{message.text}</p>}
        </form>
      )}

      {/* Илгээсний дараа (шалгагдаж байгаа эсвэл багш) дансаа тусад нь засна */}
      {!canSubmit && (app || data.isTeacher) && (
        <form className="card" onSubmit={saveBank} style={{ display: 'grid', gap: 12 }}>
          {bankFields}
          <button className="btn">{t('teacher.saveBank')}</button>
          {message && <p style={{ margin: 0, color: message.ok ? 'var(--ok)' : 'var(--err)' }}>{message.text}</p>}
        </form>
      )}
    </main>
  );
}
