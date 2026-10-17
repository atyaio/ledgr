import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'xs' | 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 border border-transparent font-semibold',
  secondary: 'bg-raised text-ink border border-line-strong hover:bg-hover',
  outline: 'bg-transparent text-ink-2 border border-line hover:border-line-strong hover:text-ink',
  ghost: 'bg-transparent text-ink-2 hover:bg-hover hover:text-ink border border-transparent',
  danger: 'bg-transparent text-critical border border-critical/40 hover:bg-critical/10',
};
const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11.5px] gap-1 rounded-sm',
  sm: 'h-7 px-2.5 text-[12.5px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[13px] gap-2 rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ className, children, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:text-ink hover:bg-hover transition-colors disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
