import { clsx } from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'critical' | 'info' | 'expense' | 'revenue'; className?: string }) {
  const tones = {
    neutral: 'bg-sunken text-ink-2',
    accent: 'bg-accent-soft text-accent',
    good: 'bg-good/10 text-good',
    warning: 'bg-warning/12 text-warning',
    critical: 'bg-critical/10 text-critical',
    info: 'bg-net/10 text-net',
    expense: 'bg-expense-soft text-expense',
    revenue: 'bg-revenue-soft text-revenue',
  };
  return <span className={clsx('inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Swatch({ color, size = 8, className, style }: { color: string; size?: number; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={clsx('inline-block rounded-full shrink-0', className)} style={{ width: size, height: size, background: color, ...style }} />;
}

export function Chip({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[13px] text-ink-2 whitespace-nowrap', className)}>
      {color && <Swatch color={color} />}
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: `${color}22`, color }}
    >
      {init}
    </span>
  );
}

/** Round icon tile used for categories / kinds in lists. */
export function Tile({ color, children, size = 36 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-[12px] shrink-0" style={{ width: size, height: size, background: `${color}1f`, color }}>
      {children}
    </span>
  );
}
