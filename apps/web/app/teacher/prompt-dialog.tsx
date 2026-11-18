'use client';

import { useState, type FormEvent } from 'react';
import { t } from '@/lib/i18n';
import { Button } from '../ui/button';
import { Dialog, DialogActions } from '../ui/dialog';
import s from './teacher.module.css';

/** `window.prompt`-ын оронд: нэг текст талбартай modal. Нээгдэх бүрд шинээр mount хийхийн тулд `open`-оор нөхцөлд. */
export function PromptDialog({
  open,
  title,
  label,
  initial = '',
  required = false,
  maxLength,
  confirmLabel,
  danger = false,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  required?: boolean;
  maxLength?: number;
  confirmLabel?: string;
  danger?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title={title}>
      <PromptForm
        label={label}
        initial={initial}
        required={required}
        maxLength={maxLength}
        confirmLabel={confirmLabel}
        danger={danger}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Dialog>
  );
}

function PromptForm({
  label,
  initial,
  required,
  maxLength,
  confirmLabel,
  danger,
  onSubmit,
  onClose,
}: {
  label: string;
  initial: string;
  required: boolean;
  maxLength?: number;
  confirmLabel?: string;
  danger: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(value.trim());
  }
  return (
    <form className={s.form} onSubmit={submit}>
      <label className={s.field}>
        {label}
        <input
          className="input"
          name="value"
          autoComplete="off"
          data-autofocus=""
          required={required}
          maxLength={maxLength}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('ui.cancel')}
        </Button>
        <Button type="submit" variant={danger ? 'danger' : 'primary'}>
          {confirmLabel ?? t('teacherUi.save')}
        </Button>
      </DialogActions>
    </form>
  );
}
