'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BANKS, type BankAccountView, type BankCode, type MyTeacherApplication } from '@lms/shared';
import { api, errorText, useApiFailure } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { Button, LinkButton } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { useToast } from '../../ui/toast';
import { useUnsavedWarning } from '../use-unsaved';
import s from '../teacher.module.css';

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

function formFrom(d: MyTeacherApplication): Form {
  const a = d.application;
  const b = d.bankAccount;
  return {
    displayName: a?.displayName ?? '',
    bio: a?.bio ?? '',
    expertise: a?.expertise ?? '',
    sampleUrl: a?.sampleUrl ?? '',
    bank: b?.bank ?? '',
    accountNumber: b?.accountNumber ?? '',
    holderName: b?.holderName ?? '',
  };
}

export default function TeacherApplyPage() {
  const fail = useApiFailure();
  const { toast } = useToast();
  const [data, setData] = useState<MyTeacherApplication | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saved, setSaved] = useState<Form>(empty);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = data !== null && (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== saved[k]);
  useUnsavedWarning(dirty);

  function load(d: MyTeacherApplication) {
    setData(d);
    const f = formFrom(d);
    setForm(f);
    setSaved(f);
    setAgreed(false);
  }

  useEffect(() => {
    api<MyTeacherApplication>('/teacher/application')
      .then((r) => load(r.data))
      .catch((err: unknown) => {
        fail(err);
      });
  }, [fail]);

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
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveBank(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const r = await api<BankAccountView>('/teacher/bank-account', {
        method: 'PUT',
        body: { bank: form.bank, accountNumber: form.accountNumber, holderName: form.holderName },
      });
      setData((d) => (d ? { ...d, bankAccount: r.data } : d));
      setSaved(form);
      toast(t('teacher.bankSaved'));
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className={s.pageNarrow} aria-busy="true" aria-label={t('ui.loading')}>
        <Skeleton height={32} width="60%" />
        <Skeleton height={200} radius={22} />
      </div>
    );
  }

  const app = data.application;
  const canSubmit = data.hasVerifiedPhone && !data.isTeacher && data.currentAgreementVersion !== null && app?.status !== 'SUBMITTED';
  const status = data.isTeacher ? 'APPROVED' : app?.status;
  const statusClass = status === 'APPROVED' ? s.ok : status === 'REJECTED' ? s.error : undefined;

  const bankFields = (
    <fieldset className={s.fieldset}>
      <legend className={s.legendText}>{t('teacher.bankTitle')}</legend>
      <label className={s.field}>
        {t('teacher.bank')}
        <select className="input" name="bank" required value={form.bank} onChange={set('bank')}>
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
      <label className={s.field}>
        {t('teacher.accountNumber')}
        <input
          className="input"
          name="accountNumber"
          required
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={form.accountNumber}
          onChange={set('accountNumber')}
        />
      </label>
      <label className={s.field}>
        {t('teacher.holderName')}
        <input className="input" name="holderName" required maxLength={120} autoComplete="name" value={form.holderName} onChange={set('holderName')} />
      </label>
    </fieldset>
  );

  return (
    <div className={s.pageNarrow}>
      <div className={s.stack}>
        <h1 className={s.title}>{t('teacher.title')}</h1>
        <p className={s.lead}>{t('teacher.intro')}</p>
      </div>

      {status && (
        <section className={status === 'REJECTED' ? `card ${s.card} ${s.cardDanger}` : `card ${s.card}`} aria-live="polite">
          <strong className={statusClass}>{t(`teacher.status${status}` as MessageKey)}</strong>
          {status === 'REJECTED' && app?.reviewNote && (
            <p className={s.pre}>
              <strong>{t('teacher.reason')}:</strong> {app.reviewNote}
            </p>
          )}
          {app && (
            <p className={s.hint}>
              {t('teacher.agreementAccepted', { version: app.agreementVersion, date: formatDate(app.agreementAcceptedAt) })}
            </p>
          )}
        </section>
      )}

      {!data.hasVerifiedPhone && (
        <section className={`card ${s.card}`}>
          <p>{t('teacher.phoneRequired')}</p>
          <LinkButton href="/me" className={s.startSelf}>
            {t('teacher.goLinkPhone')}
          </LinkButton>
        </section>
      )}
      {data.hasVerifiedPhone && data.currentAgreementVersion === null && !data.isTeacher && (
        <p className="card">{t('teacher.agreementMissing')}</p>
      )}

      {canSubmit && (
        <form className={`card ${s.form}`} onSubmit={submit}>
          <label className={s.field}>
            {t('teacher.displayName')}
            <input className="input" name="displayName" required maxLength={120} autoComplete="name" value={form.displayName} onChange={set('displayName')} />
          </label>
          <label className={s.field}>
            {t('teacher.bio')}
            <textarea className="input" name="bio" required rows={5} maxLength={5000} autoComplete="off" value={form.bio} onChange={set('bio')} />
          </label>
          <label className={s.field}>
            {t('teacher.expertise')}
            <input className="input" name="expertise" required maxLength={500} autoComplete="off" value={form.expertise} onChange={set('expertise')} />
          </label>
          <label className={s.field}>
            {t('teacher.sampleUrl')}
            <input
              className="input"
              name="sampleUrl"
              required
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              pattern="https://.*"
              value={form.sampleUrl}
              onChange={set('sampleUrl')}
            />
          </label>
          {bankFields}
          <label className={s.inlineTop}>
            <input type="checkbox" name="agreed" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              {t('teacher.agreementRead', { version: data.currentAgreementVersion! })}{' '}
              <Link href="/legal/teacher-agreement" target="_blank" rel="noreferrer">
                {t('teacher.readAgreement')}
              </Link>
            </span>
          </label>
          <Button type="submit" disabled={!agreed} loading={busy} loadingLabel={t('teacher.submitting')} className={s.startSelf}>
            {app?.status === 'REJECTED' ? t('teacher.resubmit') : t('teacher.submit')}
          </Button>
          {dirty && <small className={s.dirty}>{t('teacherUi.unsaved')}</small>}
          {message && (
            <p role="alert" className={s.error}>
              {message}
            </p>
          )}
        </form>
      )}

      {/* Илгээсний дараа (шалгагдаж байгаа эсвэл багш) дансаа тусад нь засна */}
      {!canSubmit && (app || data.isTeacher) && (
        <form className={`card ${s.form}`} onSubmit={saveBank}>
          {bankFields}
          <Button type="submit" loading={busy} className={s.startSelf}>
            {t('teacher.saveBank')}
          </Button>
          {dirty && <small className={s.dirty}>{t('teacherUi.unsaved')}</small>}
          {message && (
            <p role="alert" className={s.error}>
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
