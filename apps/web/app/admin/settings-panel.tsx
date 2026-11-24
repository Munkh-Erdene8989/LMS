'use client';

import { useEffect, useState } from 'react';
import type { SettingRevisionView, SettingView } from '@lms/shared';
import { api, errorText } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate, formatNumber } from '@/lib/format';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';
import { ErrorLine, LoadingRows } from './admin-ui';
import styles from './admin.module.css';

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SettingView[]>('/admin/settings')
      .then((r) => setSettings(r.data))
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  return (
    <section className={styles.stack} aria-labelledby="admin-settings-title">
      <h2 id="admin-settings-title" className={styles.subtitle}>
        {t('admin.settingsTitle')}
      </h2>
      {error && <ErrorLine>{error}</ErrorLine>}
      {!settings && !error && <LoadingRows />}
      {settings?.map((s) => (
        <SettingRow key={s.key} setting={s} onSaved={(u) => setSettings((p) => p!.map((x) => (x.key === u.key ? u : x)))} />
      ))}
    </section>
  );
}

function SettingRow({ setting, onSaved }: { setting: SettingView; onSaved: (s: SettingView) => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(setting.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SettingRevisionView[] | null>(null);
  const unit = t(`units.${setting.unit}` as MessageKey);
  const label = t(`settings.${setting.key}` as MessageKey);
  const inputId = `setting-${setting.key}`;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const r = await api<SettingView>(`/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: { value: Number(value) },
      });
      onSaved(r.data);
      toast.toast(t('admin.saved'));
      if (history) await loadHistory();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory() {
    setHistory((await api<SettingRevisionView[]>(`/admin/settings/${setting.key}/history`)).data);
  }

  return (
    <div className={styles.item}>
      <div className={styles.itemHead}>
        <label htmlFor={inputId}>
          <strong>{label}</strong>
        </label>
        <span className={`${styles.muted} ${styles.small}`}>
          {t('admin.default', { value: `${formatNumber(setting.defaultValue)} ${unit}` })} ·{' '}
          {t('admin.range', { min: formatNumber(setting.min), max: formatNumber(setting.max) })}
        </span>
      </div>
      <div className={styles.toolbar}>
        <input
          id={inputId}
          className={`input ${styles.narrowField}`}
          type="number"
          inputMode="numeric"
          step={1}
          min={setting.min}
          max={setting.max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span>{unit}</span>
        <Button onClick={() => void save()} loading={saving} disabled={value === String(setting.value) || value === ''}>
          {t('admin.save')}
        </Button>
        <Button variant="ghost" onClick={() => (history ? setHistory(null) : void loadHistory())}>
          {history ? t('admin.hideHistory') : t('admin.history')}
        </Button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {history && (
        <ul className={`${styles.stack} ${styles.small}`}>
          {history.length === 0 && <li>{t('admin.noHistory')}</li>}
          {history.map((h) => (
            <li key={h.id}>
              {formatNumber(h.previous)} → <strong>{formatNumber(h.value)}</strong> {unit} ·{' '}
              {t('admin.changedBy', { name: h.changedBy?.name ?? t('admin.someone') })} · {formatDate(h.createdAt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
