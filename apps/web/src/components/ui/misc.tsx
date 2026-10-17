import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Spinner } from './spinner';

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] leading-none">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-ink-3 mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClassName, eyebrow }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; eyebrow?: ReactNode }) {
  return (
    <section className={clsx('panel overflow-hidden flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 h-10 border-b border-line shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h3 className="text-[13px] font-semibold tracking-tight truncate">{title}</h3>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={clsx('inline-flex items-center gap-0.5 p-0.5 rounded-md bg-sunken border border-line', className)}>
      {items.map((it) => (
        <button
          type="button"
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            'h-6.5 px-2.5 rounded-[5px] text-[12px] font-medium transition-colors inline-flex items-center gap-1.5',
            value === it.id ? 'bg-raised text-ink shadow-sm border border-line-strong' : 'text-ink-3 hover:text-ink border border-transparent',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="num text-[10.5px] text-ink-3">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, className, size = 'sm' }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; title?: string }[]; className?: string; size?: 'xs' | 'sm' }) {
  return (
    <div className={clsx('inline-flex items-stretch rounded-md border border-line bg-sunken overflow-hidden', className)}>
      {items.map((it, i) => (
        <button
          type="button"
          key={it.id}
          title={it.title}
          onClick={() => onChange(it.id)}
          className={clsx(
            'px-2 font-medium transition-colors border-l border-line first:border-l-0',
            size === 'xs' ? 'h-6 text-[11px]' : 'h-7 text-[12px]',
            value === it.id ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink hover:bg-hover',
            i === 0 && 'pl-2.5',
            i === items.length - 1 && 'pr-2.5',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="text-ink-4 mb-3">{icon}</div>}
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {description && <p className="text-[12.5px] text-ink-3 mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 h-40 text-ink-3 text-[12.5px]">
      <Spinner className="size-4" /> {label}
      <span className="blink">▍</span>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <span className="eyebrow">{label}</span>
      <span className="num text-[15px] font-medium leading-tight">{value}</span>
      {sub && <span className="text-[11.5px] text-ink-3">{sub}</span>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num inline-flex items-center h-4.5 px-1 rounded-sm border border-line-strong bg-sunken text-[10px] text-ink-3">{children}</kbd>;
}

export function Meter({ value, max = 100, tone = 'auto', className }: { value: number; max?: number; tone?: 'auto' | 'accent'; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === 'accent' ? 'var(--accent)' : pct >= 100 ? 'var(--critical)' : pct >= 85 ? 'var(--warning)' : 'var(--s-net)';
  return (
    <div className={clsx('h-1.5 w-full rounded-full overflow-hidden', className)} style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
