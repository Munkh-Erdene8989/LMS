import Link from 'next/link';
import { t } from '@/lib/i18n';
import s from './error-page.module.css';

export default function NotFound() {
  return (
    <div className={s.root}>
      <div className={s.box}>
        <p className={s.code}>404</p>
        <h1 className={s.title}>{t('miscUi.notFoundTitle')}</h1>
        <p className={s.body}>{t('miscUi.notFoundBody')}</p>
        <div className={s.actions}>
          <Link href="/courses" className={s.btn}>
            {t('referral.browse')}
          </Link>
          <Link href="/" className={`${s.btn} ${s.btnSecondary}`}>
            {t('miscUi.goHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
