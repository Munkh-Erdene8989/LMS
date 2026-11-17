'use client';

import { t } from '@/lib/i18n';

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={t('learning.progressLabel', { percent })}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
