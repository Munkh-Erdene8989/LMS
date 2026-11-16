'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthUser, IdentifierType, OtpStartResponse } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t } from '@/lib/i18n';

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
  const secondsLeft = useCountdown(step.kind === 'input' ? null : step.challenge.expiresAt);
  const expired = secondsLeft === 0;

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

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyRef.current(code.trim());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const restart = () => {
    setStep({ kind: 'input' });
    setError(null);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {step.kind === 'input' && (
        <form onSubmit={start} style={{ display: 'grid', gap: 12 }}>
          {types.length > 1 && (
            <div role="tablist" style={{ display: 'flex', gap: 8 }}>
              {types.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  role="tab"
                  aria-selected={type === ty}
                  className={type === ty ? 'btn' : 'btn btn-ghost'}
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
          <input
            className="input"
            required
            autoFocus
            inputMode={type === 'PHONE' ? 'tel' : 'email'}
            type={type === 'PHONE' ? 'tel' : 'email'}
            placeholder={type === 'PHONE' ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
            aria-label={type === 'PHONE' ? t('auth.phone') : t('auth.email')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="btn" disabled={busy}>
            {busy ? t('auth.sending') : t('auth.continue')}
          </button>
        </form>
      )}

      {step.kind === 'email' && !expired && (
        <form onSubmit={submitCode} style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>{t('auth.emailSent', { email: step.email })}</p>
          <input
            className="input"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            aria-label={t('auth.codeLabel')}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ letterSpacing: 6, fontSize: 22, textAlign: 'center' }}
          />
          <button className="btn" disabled={busy || code.length !== 6}>
            {busy ? t('auth.verifying') : t('auth.verify')}
          </button>
        </form>
      )}

      {step.kind === 'phone' && step.challenge.phone && !expired && (
        <div style={{ display: 'grid', gap: 12 }}>
          <strong>{t('auth.smsTitle')}</strong>
          <p style={{ margin: 0 }}>{t('auth.smsBody', { shortcode: step.challenge.phone.shortcode })}</p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: 6, textAlign: 'center' }}>
            {step.challenge.phone.code}
          </p>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{step.challenge.phone.displayInstruction}</p>
          <a className="btn" href={step.challenge.phone.smsUri}>
            {t('auth.openSms')}
          </a>
          {!error && <p style={{ margin: 0, color: 'var(--muted)' }}>{t('auth.waitingSms')}</p>}
        </div>
      )}

      {step.kind !== 'input' && secondsLeft !== null && !expired && (
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>{t('auth.expiresIn', { seconds: secondsLeft })}</p>
      )}
      {step.kind !== 'input' && expired && <p style={{ margin: 0, color: 'var(--err)' }}>{t('auth.expired')}</p>}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--err)' }}>
          {error}
        </p>
      )}
      {step.kind !== 'input' && (
        <button type="button" className="btn btn-ghost" onClick={restart}>
          {t('auth.restart')}
        </button>
      )}
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof ApiRequestError && err.body?.message ? err.body.message : t('auth.genericError');
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
