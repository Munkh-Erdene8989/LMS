import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps } from 'react';
import { t } from '@/lib/i18n';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

function classes(variant: ButtonVariant, size: ButtonSize, extra?: string): string {
  return ['btn', variant !== 'primary' && `btn-${variant}`, size === 'sm' && 'btn-small', extra].filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Request явж байхад: disabled + `aria-busy`, текст «Ачаалж байна…» болно (loadingLabel-ээр солино). */
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  type = 'button',
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (loadingLabel ?? t('ui.loading')) : children}
    </button>
  );
}

export interface LinkButtonProps
  extends
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>,
    Pick<ComponentProps<typeof Link>, 'href' | 'prefetch' | 'replace' | 'scroll'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: LinkButtonProps) {
  return <Link {...rest} className={classes(variant, size, className)} />;
}
