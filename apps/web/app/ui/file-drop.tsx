'use client';

import { useId, useState, type DragEvent } from 'react';
import { t } from '@/lib/i18n';
import { formatFileSize as formatSize } from '@/lib/format';
import styles from './file-drop.module.css';

const MB = 1024 * 1024;

export interface FileDropProps {
  /** Харагдах шошго (жишээ «Зураг оруулах»). */
  label: string;
  /** Төрөл ба хэмжээний тайлбар (жишээ «JPG/PNG/WEBP, 5MB хүртэл»). */
  hint?: string;
  /** `<input accept>` — `image/*`, `application/pdf` гэх мэт; drop-д мөн шалгана. */
  accept?: string;
  /** Байтаар; хэтэрвэл `onFile` дуудагдахгүй, алдааг доор харуулна. */
  maxBytes?: number;
  disabled?: boolean;
  /** Upload явж байна: тоо бол явцын мөр (0–100), `true` бол тодорхойгүй явц. */
  progress?: number | boolean | null;
  /** Upload явж байхад шошгын оронд (жишээ «Байршуулж байна… 40%»). */
  progressLabel?: string;
  /** Сонгосон файл (controlled) — нэр, хэмжээг харуулна. */
  file?: File | null;
  /** Өгвөл сонгосон файлын хажууд «Хасах» товч. */
  onClear?: () => void;
  onFile: (file: File) => void;
}

function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
}

/**
 * Файл сонгох / чирж оруулах талбар. Жинхэнэ `<input type="file">` нь sr-only боловч focus авна (keyboard,
 * screen reader). Төрөл ба хэмжээг client-д шалгаж, явцыг `<progress>`-оор харуулна.
 */
export function FileDrop({ label, hint, accept, maxBytes, disabled, progress, progressLabel, file, onClear, onFile }: FileDropProps) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== undefined && progress !== null && progress !== false;
  const off = disabled || busy;

  function pick(f: File | undefined) {
    if (!f) return;
    if (!matchesAccept(f, accept)) return setError(t('ui.fileWrongType'));
    if (maxBytes && f.size > maxBytes) return setError(t('ui.fileTooLarge', { max: Math.round(maxBytes / MB) }));
    setError(null);
    onFile(f);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (!off) pick(e.dataTransfer.files[0]);
  }

  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.wrap}>
      <label
        htmlFor={id}
        className={[styles.zone, over && styles.over, off && styles.off, error && styles.invalid].filter(Boolean).join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          if (!off) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input
          id={id}
          className={styles.input}
          type="file"
          accept={accept}
          disabled={off}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            pick(f);
          }}
        />
        <svg className={styles.icon} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.text}>
          <span className={styles.label}>{busy && progressLabel ? progressLabel : label}</span>
          <span className={styles.sub}>{over ? t('ui.fileDropActive') : t('ui.fileDrop')}</span>
          {hint && (
            <span id={hintId} className={styles.sub}>
              {hint}
            </span>
          )}
        </span>
      </label>
      {busy && (
        <progress
          className={styles.progress}
          max={100}
          value={typeof progress === 'number' ? progress : undefined}
          aria-label={progressLabel ?? t('ui.loading')}
        />
      )}
      {file && !busy && (
        <p className={styles.selected}>
          <span className={styles.name}>{file.name}</span>
          <span className={styles.size}>{formatSize(file.size)}</span>
          {onClear && (
            <button type="button" className={styles.clear} onClick={onClear}>
              {t('ui.fileRemove')}
            </button>
          )}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
