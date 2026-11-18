'use client';

import type { QPayDeeplinkView } from '@lms/shared';
import { Button } from '@/app/ui/button';
import { Dialog, DialogActions } from '@/app/ui/dialog';
import { formatMnt } from '@/lib/format';
import { t } from '@/lib/i18n';
import styles from './credits.module.css';

export interface QPayDialogProps {
  open: boolean;
  /** `PENDING` бол QR харуулна; бусад төлөв үр дүнгийн мессеж. */
  status: string;
  amountMnt: number;
  qrImage: string | null;
  deeplinks: QPayDeeplinkView[];
  busy: boolean;
  /** `title` дотор `{amount}` байрлалд formatMnt орно. */
  labels: {
    title: string;
    scan: string;
    qrAlt: string;
    openBank: string;
    pending: string;
    result: string;
    check: string;
    checking: string;
    close: string;
  };
  onCheck: () => void;
  onClose: () => void;
}

/** QPay төлбөрийн modal: тогтмол хэмжээтэй QR (layout shift-гүй), төлөв `aria-live`. */
export function QPayDialog({ open, status, amountMnt, qrImage, deeplinks, busy, labels, onCheck, onClose }: QPayDialogProps) {
  const pending = status === 'PENDING';
  const paid = status === 'PAID';
  const title = pending
    ? labels.title.replace('{amount}', formatMnt(amountMnt))
    : paid
      ? t('creditsUi.statusPaid')
      : t('creditsUi.statusFailed');
  return (
    <Dialog open={open} onClose={onClose} title={title} description={pending ? labels.scan : undefined} closeOnScrim={!pending}>
      {pending ? (
        <>
          <div className={styles.qrBox}>
            {qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- base64 QR, тогтмол хэмжээ
              <img className={styles.qrImg} width={240} height={240} src={`data:image/png;base64,${qrImage}`} alt={labels.qrAlt} />
            ) : (
              <span className={styles.qrEmpty}>{t('creditsUi.qrPlaceholder')}</span>
            )}
          </div>
          {deeplinks.length > 0 && (
            <ul className={styles.bankLinks} aria-label={labels.openBank}>
              {deeplinks.map((d) => (
                <li key={d.link}>
                  <a className={styles.bankLink} href={d.link}>
                    {d.logo && (
                      // eslint-disable-next-line @next/next/no-img-element -- гадны банкны лого
                      <img src={d.logo} alt="" width={32} height={32} />
                    )}
                    <span>{d.description || d.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      <p className={paid ? styles.statusOk : pending ? styles.status : styles.statusErr} role="status" aria-live="polite">
        {pending ? labels.pending : labels.result}
      </p>
      <DialogActions>
        {pending && (
          <Button variant="secondary" loading={busy} loadingLabel={labels.checking} onClick={onCheck}>
            {labels.check}
          </Button>
        )}
        <Button variant={pending ? 'ghost' : 'primary'} data-autofocus="" onClick={onClose}>
          {labels.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
