'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeCertificateCode } from '@lms/shared';
import { t } from '@/lib/i18n';
import styles from './verify.module.css';

/** Код оруулах форм → `/verify/<code>`. */
export function VerifyForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-err`;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCertificateCode(value);
        if (!code) return setInvalid(true);
        setInvalid(false);
        router.push(`/verify/${code}`);
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={inputId}>
          {t('certificate.verifyLabel')}
        </label>
        <input
          id={inputId}
          name="code"
          type="text"
          className={`input ${styles.code}`}
          placeholder={t('certificate.verifyPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="search"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
      </div>
      <button type="submit" className="btn">
        {t('certificate.verifySubmit')}
      </button>
      {invalid && (
        <p id={errorId} role="alert" className={styles.error}>
          {t('certificate.verifyNotFound')}
        </p>
      )}
    </form>
  );
}
