'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeCertificateCode } from '@lms/shared';
import { t } from '@/lib/i18n';

/** Код оруулах форм → `/verify/<code>`. */
export function VerifyForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCertificateCode(value);
        if (!code) return setInvalid(true);
        setInvalid(false);
        router.push(`/verify/${code}`);
      }}
    >
      <input
        aria-label={t('certificate.verifyInput')}
        placeholder={t('certificate.verifyInput')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ flex: '1 1 260px' }}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="btn">
        {t('certificate.verifySubmit')}
      </button>
      {invalid && (
        <small role="alert" style={{ color: 'var(--err)', flexBasis: '100%' }}>
          {t('certificate.verifyNotFound')}
        </small>
      )}
    </form>
  );
}
