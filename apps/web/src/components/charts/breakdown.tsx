import { clsx } from 'clsx';
import { useProject } from '@/lib/project';
import { pct } from '@/lib/format';
import { Swatch } from '@/components/ui/badge';

export interface BreakdownItem {
  id: string | null;
  name: string;
  color: string;
  amountMinor: number;
  pct: number;
  count?: number;
}

/** Horizontal proportional bars with direct labels. */
export function Breakdown({ items, emptyLabel = 'Nothing in this range', max = 7, onSelect, selectedId }: { items: BreakdownItem[]; emptyLabel?: string; max?: number; onSelect?: (id: string | null) => void; selectedId?: string | null }) {
  const { money } = useProject();
  if (!items.length) return <div className="flex items-center justify-center text-ink-3 text-[13.5px] py-10">{emptyLabel}</div>;
  const top = items.slice(0, max);
  const rest = items.slice(max);
  const rows: BreakdownItem[] = rest.length
    ? [...top, { id: '__other', name: `Other (${rest.length})`, color: 'var(--s-other)', amountMinor: rest.reduce((a, b) => a + b.amountMinor, 0), pct: rest.reduce((a, b) => a + b.pct, 0) }]
    : top;
  const maxAmt = Math.max(...rows.map((r) => r.amountMinor), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id ?? r.name}>
          <button
            type="button"
            className={clsx('w-full text-left group', onSelect && r.id !== '__other' && 'cursor-pointer')}
            onClick={() => onSelect && r.id !== '__other' && onSelect(r.id)}
            disabled={!onSelect || r.id === '__other'}
          >
            <div className="flex items-center justify-between gap-3 text-[13.5px] mb-1.5">
              <span className={clsx('inline-flex items-center gap-2 truncate', selectedId === r.id ? 'text-accent' : 'text-ink')}>
                <Swatch color={r.color} size={9} />
                <span className="truncate">{r.name}</span>
                {r.count !== undefined && <span className="num text-[12px] text-ink-3">{r.count}</span>}
              </span>
              <span className="num whitespace-nowrap font-medium">
                {money(r.amountMinor)} <span className="text-ink-3 font-normal text-[12px]">{pct(r.pct, 0)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-sunken overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(r.amountMinor / maxAmt) * 100}%`, background: r.color }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
