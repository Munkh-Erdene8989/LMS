'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './dialog.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let savedOverflow = '';
let savedPadding = '';

function lockScroll() {
  if (scrollLocks++ > 0) return;
  const body = document.body;
  savedOverflow = body.style.overflow;
  savedPadding = body.style.paddingRight;
  const bar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (bar > 0) body.style.paddingRight = `${bar}px`;
}

function unlockScroll() {
  if (--scrollLocks > 0) return;
  scrollLocks = 0;
  document.body.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPadding;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Гарчгийн доорх нэг өгүүлбэр (aria-describedby). */
  description?: ReactNode;
  children?: ReactNode;
  /** Scrim дээр дарахад хаах (default true). */
  closeOnScrim?: boolean;
}

/**
 * Модал: portal, focus trap, Esc, scrim click, арын агуулгад `inert`, body scroll lock.
 * Нээхэд `[data-autofocus]` эсвэл эхний control руу focus; хаахад нээсэн элемент рүү буцаана.
 */
export function Dialog({ open, onClose, title, description, children, closeOnScrim = true }: DialogProps) {
  const portalRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !mounted) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const portal = portalRef.current;
    const panel = panelRef.current;
    lockScroll();

    // Арын агуулга: portal болон `data-ui-live` (toast) бус бүх body child-д inert.
    const made: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === portal || el.hasAttribute('data-ui-live') || el.hasAttribute('inert')) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      el.setAttribute('inert', '');
      made.push(el);
    }

    if (panel) {
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }

    return () => {
      for (const el of made) el.removeAttribute('inert');
      unlockScroll();
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Зөвхөн хамгийн дээд dialog хаагдана.
      const tops = document.querySelectorAll('[data-dialog-panel]');
      if (tops[tops.length - 1] !== panelRef.current) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !mounted) return null;

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div ref={portalRef}>
      <div
        className={styles.scrim}
        onMouseDown={(e) => {
          if (closeOnScrim && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          data-dialog-panel=""
          onKeyDown={onPanelKeyDown}
        >
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description ? (
            <p id={descId} className={styles.description}>
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Dialog доторх үйлдлийн мөр (Болих + үндсэн үйлдэл). */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
