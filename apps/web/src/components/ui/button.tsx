import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:opacity-90 font-semibold shadow-sm',
  secondary: 'bg-card text-ink border border-line-strong hover:bg-card-hover font-medium',
  soft: 'bg-accent-soft text-accent hover:brightness-95 font-medium',
  ghost: 'bg-transparent text-ink-2 hover:bg-card-hover hover:text-ink font-medium',
  danger: 'bg-critical/10 text-critical hover:bg-critical/15 font-medium',
};
const sizes: Record<Size, string> = {
  xs: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-[9px]',
  sm: 'h-9 px-3 text-[13.5px] gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-[12px]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-[14px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading, icon, className, children, disabled, full, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'pressable inline-flex items-center justify-center whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ className, children, label, size = 'md', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'pressable inline-flex items-center justify-center rounded-full text-ink-2 hover:text-ink hover:bg-card-hover transition-colors disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
