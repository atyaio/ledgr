import { clsx } from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'critical' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-raised text-ink-2 border-line',
    accent: 'bg-accent-soft text-accent border-accent/30',
    good: 'bg-good/10 text-good border-good/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    critical: 'bg-critical/10 text-critical border-critical/30',
    info: 'bg-net/10 text-net border-net/30',
  };
  return <span className={clsx('inline-flex items-center gap-1 h-5 px-1.5 rounded-sm border text-[11px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Swatch({ color, size = 8, className, style }: { color: string; size?: number; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={clsx('inline-block rounded-[2px] shrink-0', className)} style={{ width: size, height: size, background: color, ...style }} />;
}

export function Chip({ color, children, className }: { color?: string; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[12px] text-ink-2 whitespace-nowrap', className)}>
      {color && <Swatch color={color} />}
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-semibold text-[10px] shrink-0"
      style={{ width: size, height: size, background: `${color}26`, color, border: `1px solid ${color}55` }}
    >
      {init}
    </span>
  );
}
