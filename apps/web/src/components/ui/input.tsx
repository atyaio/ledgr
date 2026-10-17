import { clsx } from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base =
  'w-full bg-sunken border border-line rounded-md px-2.5 text-[13px] text-ink placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 transition-colors disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function Input({ className, mono, ...rest }, ref) {
  return <input ref={ref} className={clsx(base, 'h-8', mono && 'num', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(base, 'py-1.5 min-h-[64px] resize-y', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={clsx(base, 'h-8 appearance-none pr-7', className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export function Field({ label, hint, error, children, className, required }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">
          {label}
          {required && <span className="text-accent ml-0.5">*</span>}
        </span>
        {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11.5px] text-critical">{error}</span>}
    </label>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={clsx('inline-flex items-center gap-2 cursor-pointer text-[12.5px] text-ink-2 select-none', className)}>
      <input type="checkbox" className="size-3.5 rounded-sm border border-line-strong bg-sunken accent-[var(--accent)]" {...rest} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[12.5px] text-ink-2 disabled:opacity-50"
    >
      <span className={clsx('relative inline-block h-4 w-7 rounded-full transition-colors border', checked ? 'bg-accent border-accent' : 'bg-sunken border-line-strong')}>
        <span className={clsx('absolute top-0.5 size-3 rounded-full transition-transform', checked ? 'translate-x-3.5 bg-accent-ink' : 'translate-x-0.5 bg-ink-3')} />
      </span>
      {label}
    </button>
  );
}
