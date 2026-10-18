import { clsx } from 'clsx';
import { useProject } from '@/lib/project';
import type { FormatMoneyOptions } from '@atyaio/ledgr-shared';

export function Money({
  minor,
  className,
  tone = 'neutral',
  signed,
  compact,
  muted,
}: {
  minor: number;
  className?: string;
  /** neutral | flow (green/red by sign) | expense (orange) | revenue (green) */
  tone?: 'neutral' | 'flow' | 'expense' | 'revenue';
  signed?: boolean;
  compact?: boolean;
  muted?: boolean;
}) {
  const { money } = useProject();
  const opts: FormatMoneyOptions = { signed, compact };
  const color =
    tone === 'flow' ? (minor > 0 ? 'text-good' : minor < 0 ? 'text-critical' : 'text-ink-3') : tone === 'expense' ? 'text-expense' : tone === 'revenue' ? 'text-revenue' : muted ? 'text-ink-3' : '';
  return (
    <span className={clsx('num', color, className)} title={money(minor)}>
      {money(minor, opts)}
    </span>
  );
}
