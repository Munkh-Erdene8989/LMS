'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AuthUser, IdentifierType, OtpStartResponse } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';
import { Button } from './ui/button';
import styles from './login/login.module.css';

const POLL_MS = 3000;

type Step =
  | { kind: 'input' }
  | { kind: 'email'; challenge: OtpStartResponse; email: string }
  | { kind: 'phone'; challenge: OtpStartResponse };

/**
 * Утас/имэйл баталгаажуулах нэгдсэн урсгал. Нэвтрэх (`/auth/otp/*`) болон
 * identifier холбох (`/me/identifiers/*`) хоёуланд ашиглана.
 * Утас: verify.mn — хэрэглэгч кодыг SMS-ээр илгээж, бид 3 сек тутам шалгана.
 */
export function OtpFlow({
  basePath,
  types,
  onVerified,
}: {
  basePath: '/auth/otp' | '/me/identifiers';
  types: IdentifierType[];
  onVerified: (user: AuthUser) => void;
}) {
  const [type, setType] = useState<IdentifierType>(types[0]!);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'input' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const secondsLeft = useCountdown(step.kind === 'input' ? null : step.challenge.expiresAt);
  const expired = secondsLeft === 0;
  const uid = useId();
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;
  const valueRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const finePointer = useFinePointer();

  const verifyRef = useRef<(code?: string) => Promise<void>>(async () => {});
  verifyRef.current = async (codeValue?: string) => {
    if (step.kind === 'input') return;
    const res = await api<{ status: 'pending' } | { status: 'verified'; user: AuthUser }>(`${basePath}/verify`, {
      method: 'POST',
      body: { challengeId: step.challenge.challengeId, code: codeValue },
    });
    if (res.data.status === 'verified') onVerified(res.data.user);
  };

  // Утас: SMS ирэх хүртэл тогтмол шалгана.
  useEffect(() => {
    if (step.kind !== 'phone' || expired) return;
    let stopped = false;
    const timer = setInterval(() => {
      verifyRef.current().catch((err: unknown) => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        setError(messageOf(err));
      });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, expired]);

  // autoFocus зөвхөн desktop (нарийн заагчтай) төхөөрөмж дээр; утсан дээр гар хүчээр нээхгүй.
  useEffect(() => {
    if (!finePointer) return;
    if (step.kind === 'input') valueRef.current?.focus();
    else if (step.kind === 'email') codeRef.current?.focus();
  }, [finePointer, step.kind, type]);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<OtpStartResponse>(`${basePath}/start`, { method: 'POST', body: { type, value } });
      setCode('');
      setStep(type === 'EMAIL' ? { kind: 'email', challenge: res.data, email: value.trim() } : { kind: 'phone', challenge: res.data });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e?: FormEvent, override?: string) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyRef.current((override ?? code).trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError(null);
    // 6 дахь цифр (эсвэл бүтэн paste) орохтой зэрэг автоматаар илгээнэ.
    if (digits.length === 6) void submitCode(undefined, digits);
  }

  const restart = () => {
    setStep({ kind: 'input' });
    setError(null);
  };

  const isPhone = type === 'PHONE';
  const inputError = step.kind === 'input' && error ? errorId : undefined;
  const codeError = step.kind === 'email' && error ? errorId : undefined;

  return (
    <div className={styles.flow}>
      {step.kind === 'input' && (
        <form onSubmit={start} className={styles.form}>
          {types.length > 1 && (
            <div role="group" aria-label={t('auth.methodLabel')} className={styles.segmented}>
              {types.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  aria-pressed={type === ty}
                  className={styles.seg}
                  onClick={() => {
                    setType(ty);
                    setValue('');
                    setError(null);
                  }}
                >
                  {ty === 'PHONE' ? t('auth.phone') : t('auth.email')}
                </button>
              ))}
            </div>
          )}
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${uid}-value`}>
              {isPhone ? t('auth.phoneLabel') : t('auth.emailLabel')}
            </label>
            <input
              id={`${uid}-value`}
              ref={valueRef}
              className={`input ${inputError ? styles.invalid : ''}`}
              required
              name={isPhone ? 'tel' : 'email'}
              type={isPhone ? 'tel' : 'email'}
              autoComplete={isPhone ? 'tel' : 'email'}
              enterKeyHint="go"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={isPhone ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} loadingLabel={t('auth.sending')}>
            {t('auth.continue')}
          </Button>
        </form>
      )}

      {step.kind === 'email' && !expired && (
        <form onSubmit={submitCode} className={styles.form}>
          <p className={styles.text}>{t('auth.emailSent', { email: step.email })}</p>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${uid}-code`}>
              {t('auth.codeLabel')}
            </label>
            <div className={styles.otp}>
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={[
                    styles.cell,
                    focused && i === Math.min(code.length, 5) ? styles.cellActive : '',
                    codeError ? styles.cellInvalid : '',
                  ].join(' ')}
                >
                  {code[i] ?? ''}
                </span>
              ))}
              <input
                id={`${uid}-code`}
                ref={codeRef}
                className={styles.otpInput}
                name="code"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                pattern="\d{6}"
                maxLength={6}
                aria-label={t('auth.codeLabel')}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${hintId} ${errorId}` : hintId}
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
            </div>
            <p id={hintId} className={styles.hint}>
              {t('auth.codeHint')}
            </p>
          </div>
          {codeError && (
            <p id={errorId} role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} loadingLabel={t('auth.verifying')} disabled={code.length !== 6}>
            {t('auth.verify')}
          </Button>
        </form>
      )}

      {step.kind === 'phone' && step.challenge.phone && !expired && (
        <div className={styles.flow}>
          <strong>{t('auth.smsTitle')}</strong>
          <p className={styles.text}>{t('auth.smsBody', { shortcode: step.challenge.phone.shortcode })}</p>
          <p className={styles.smsCode}>{step.challenge.phone.code}</p>
          <p className={styles.hint}>{step.challenge.phone.displayInstruction}</p>
          <a className="btn" href={step.challenge.phone.smsUri}>
            {t('auth.openSms')}
          </a>
          {!error && <p className={styles.hint}>{t('auth.waitingSms')}</p>}
        </div>
      )}

      {step.kind !== 'input' && secondsLeft !== null && !expired && (
        <p className={styles.countdown} aria-hidden="true">
          {t('auth.expiresIn', { seconds: secondsLeft })}
        </p>
      )}
      {step.kind !== 'input' && expired && (
        <p role="alert" className={styles.error}>
          {t('auth.expired')}
        </p>
      )}
      {step.kind === 'phone' && error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {step.kind !== 'input' && (
        <Button variant="ghost" onClick={restart}>
          {t('auth.restart')}
        </Button>
      )}
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof ApiRequestError && err.body?.message ? err.body.message : t('auth.genericError');
}

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(window.matchMedia('(pointer: fine)').matches);
  }, []);
  return fine;
}

function useCountdown(until: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
}
