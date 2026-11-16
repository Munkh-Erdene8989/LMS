'use client';

import { useEffect, useState } from 'react';
import type { SettingRevisionView, SettingView } from '@lms/shared';
import { api, ApiRequestError } from '@/lib/client-api';
import { t, type MessageKey } from '@/lib/i18n';
import { formatDate, formatNumber } from '@/lib/format';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingView[] | null>(null);

  useEffect(() => {
    void api<SettingView[]>('/admin/settings').then((r) => setSettings(r.data));
  }, []);

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t('admin.settingsTitle')}</h1>
      {!settings && <p>{t('me.loading')}</p>}
      {settings?.map((s) => (
        <SettingRow key={s.key} setting={s} onSaved={(u) => setSettings((p) => p!.map((x) => (x.key === u.key ? u : x)))} />
      ))}
    </main>
  );
}

function SettingRow({ setting, onSaved }: { setting: SettingView; onSaved: (s: SettingView) => void }) {
  const [value, setValue] = useState(String(setting.value));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<SettingRevisionView[] | null>(null);
  const unit = t(`units.${setting.unit}` as MessageKey);

  async function save() {
    setStatus(null);
    try {
      const r = await api<SettingView>(`/admin/settings/${setting.key}`, {
        method: 'PUT',
        body: { value: Number(value) },
      });
      onSaved(r.data);
      setStatus({ ok: true, text: t('admin.saved') });
      if (history) await loadHistory();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof ApiRequestError ? err.message : t('auth.genericError') });
    }
  }

  async function loadHistory() {
    setHistory((await api<SettingRevisionView[]>(`/admin/settings/${setting.key}/history`)).data);
  }

  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{t(`settings.${setting.key}` as MessageKey)}</strong>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>
          {t('admin.default', { value: `${formatNumber(setting.defaultValue)} ${unit}` })} ·{' '}
          {t('admin.range', { min: formatNumber(setting.min), max: formatNumber(setting.max) })}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          type="number"
          step={1}
          min={setting.min}
          max={setting.max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ maxWidth: 200 }}
          aria-label={t(`settings.${setting.key}` as MessageKey)}
        />
        <span>{unit}</span>
        <button className="btn" onClick={save} disabled={value === String(setting.value) || value === ''}>
          {t('admin.save')}
        </button>
        <button className="btn btn-ghost" onClick={() => (history ? setHistory(null) : void loadHistory())}>
          {history ? t('admin.hideHistory') : t('admin.history')}
        </button>
        {status && <span style={{ color: status.ok ? 'var(--ok)' : 'var(--err)' }}>{status.text}</span>}
      </div>
      {history && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {history.length === 0 && <li>{t('admin.noHistory')}</li>}
          {history.map((h) => (
            <li key={h.id}>
              {formatNumber(h.previous)} → <strong>{formatNumber(h.value)}</strong> {unit} ·{' '}
              {t('admin.changedBy', { name: h.changedBy?.name ?? t('admin.someone') })} · {formatDate(h.createdAt)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
