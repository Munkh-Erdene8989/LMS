import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

export interface EmptyStateProps {
  /** Icon (SVG); декоратив тул `aria-hidden`-д ороогдоно. */
  icon?: ReactNode;
  /** Нэг өгүүлбэр. */
  title: string;
  description?: string;
  /** Үндсэн CTA (`<LinkButton>` / `<Button>`). */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
