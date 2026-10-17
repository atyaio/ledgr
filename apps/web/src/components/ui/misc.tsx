import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Spinner } from './spinner';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4 mb-4 md:mb-5">
      <div className="min-w-0">
        <h1 className="text-[24px] md:text-[26px] font-semibold tracking-[-0.02em] leading-tight">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName, subtitle, flush }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean }) {
  return (
    <section className={clsx('card overflow-hidden flex flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-2 shrink-0">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold tracking-tight truncate">{title}</h3>}
            {subtitle && <p className="text-[12.5px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx('flex-1 min-h-0', !flush && 'px-4 md:px-5 pb-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex items-center gap-1 p-1 rounded-[14px] bg-sunken w-full md:w-auto overflow-x-auto no-scrollbar', className)}>
      {items.map((it) => (
        <button
          type="button"
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            'flex-1 md:flex-none h-9 px-3.5 rounded-[11px] text-[13.5px] font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
            value === it.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="num text-[12px] text-ink-3">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, className, size = 'sm' }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; title?: string }[]; className?: string; size?: 'xs' | 'sm' }) {
  return (
    <div className={clsx('inline-flex items-center gap-0.5 p-0.5 rounded-[11px] bg-sunken', className)}>
      {items.map((it) => (
        <button
          type="button"
          key={it.id}
          title={it.title}
          onClick={() => onChange(it.id)}
          className={clsx(
            'px-3 font-medium transition-colors rounded-[9px] whitespace-nowrap',
            size === 'xs' ? 'h-7 text-[12.5px]' : 'h-8 text-[13px]',
            value === it.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
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
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && <div className="text-ink-4 mb-3 [&>svg]:size-8">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="text-[13.5px] text-ink-3 mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 h-40 text-ink-3 text-[14px]">
      <Spinner className="size-4" /> {label}…
    </div>
  );
}

export function Meter({ value, max = 100, className, color }: { value: number; max?: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = color ?? (pct >= 100 ? 'var(--critical)' : pct >= 85 ? 'var(--warning)' : 'var(--s-net)');
  return (
    <div className={clsx('h-2 w-full rounded-full overflow-hidden bg-sunken', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: fill }} />
    </div>
  );
}

/** Mobile-friendly list row: tap target, leading tile, title/subtitle, trailing value. */
export function ListRow({ leading, title, subtitle, trailing, onClick, className, selected }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void; className?: string; selected?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx('w-full flex items-center gap-3 px-4 py-3 text-left min-h-[60px] transition-colors', onClick && 'row-hover pressable', selected && 'bg-accent-soft/50', className)}
    >
      {leading}
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-medium truncate">{title}</span>
        {subtitle && <span className="block text-[12.5px] text-ink-3 truncate">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </Comp>
  );
}
