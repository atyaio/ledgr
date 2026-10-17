import { clsx } from 'clsx';
import { useProject } from '@/lib/project';
import type { FormatMoneyOptions } from '@ledgr/shared';

export function Money({
  minor,
  className,
  tone = 'auto',
  signed,
  compact,
  muted,
}: {
  minor: number;
  className?: string;
  /** auto: neutral; flow: green for positive, red for negative; expense/revenue: fixed series colour */
  tone?: 'auto' | 'flow' | 'neutral';
  signed?: boolean;
  compact?: boolean;
  muted?: boolean;
}) {
  const { money } = useProject();
  const opts: FormatMoneyOptions = { signed, compact };
  const color = tone === 'flow' ? (minor > 0 ? 'text-good' : minor < 0 ? 'text-critical' : 'text-ink-3') : muted ? 'text-ink-3' : '';
  return (
    <span className={clsx('num', color, className)} title={money(minor)}>
      {money(minor, opts)}
    </span>
  );
}
