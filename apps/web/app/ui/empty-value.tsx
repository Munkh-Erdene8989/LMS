import { t } from '@/lib/i18n';

/** Хоосон утга: харагдахдаа «—», screen reader-т «Мэдээлэл алга». */
export function EmptyValue() {
  return (
    <span className="muted">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('ui.emptyValue')}</span>
    </span>
  );
}
