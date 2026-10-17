import { clsx } from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base =
  'w-full bg-card border border-line-strong rounded-[12px] px-3.5 text-ink placeholder:text-ink-3 hover:border-ink-4 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 transition-colors disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; compact?: boolean }>(function Input({ className, mono, compact, ...rest }, ref) {
  return <input ref={ref} className={clsx(base, compact ? 'h-9 rounded-[10px] text-[13.5px]' : 'h-11 md:h-10', mono && 'num', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(base, 'py-2.5 min-h-[76px] resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }>(function Select({ className, children, compact, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={clsx(base, 'appearance-none pr-9', compact ? 'h-9 rounded-[10px] text-[13.5px]' : 'h-11 md:h-10', className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export function Field({ label, hint, error, children, className, required }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="text-critical ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-[12.5px] text-critical">{error}</span>}
    </label>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={clsx('inline-flex items-center gap-2.5 cursor-pointer text-[14px] text-ink-2 select-none min-h-[32px]', className)}>
      <input type="checkbox" className="size-[18px] rounded-[5px] border border-line-strong accent-[var(--accent)]" {...rest} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left text-[14px] text-ink disabled:opacity-50 min-h-[40px]"
    >
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-[12.5px] text-ink-3">{description}</span>}
      </span>
      <span className={clsx('relative inline-block h-[26px] w-[44px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}>
        <span className={clsx('absolute top-[3px] size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[21px]' : 'translate-x-[3px]')} />
      </span>
    </button>
  );
}
