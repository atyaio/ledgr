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

/** Horizontal proportional bars with direct labels — one axis, labelled, no legend needed. */
export function Breakdown({ items, emptyLabel = 'Nothing in this range', max = 8, onSelect, selectedId }: { items: BreakdownItem[]; emptyLabel?: string; max?: number; onSelect?: (id: string | null) => void; selectedId?: string | null }) {
  const { money } = useProject();
  if (!items.length) return <div className="h-full flex items-center justify-center text-ink-3 text-[12.5px] py-10">{emptyLabel}</div>;
  const top = items.slice(0, max);
  const rest = items.slice(max);
  const rows: BreakdownItem[] = rest.length
    ? [...top, { id: '__other', name: `Other (${rest.length})`, color: 'var(--s-other)', amountMinor: rest.reduce((a, b) => a + b.amountMinor, 0), pct: rest.reduce((a, b) => a + b.pct, 0) }]
    : top;
  const maxAmt = Math.max(...rows.map((r) => r.amountMinor), 1);
  return (
    <ul className="px-4 py-3 space-y-2.5">
      {rows.map((r) => (
        <li key={r.id ?? r.name}>
          <button
            className={clsx('w-full text-left group', onSelect && r.id !== '__other' && 'cursor-pointer')}
            onClick={() => onSelect && r.id !== '__other' && onSelect(r.id)}
            disabled={!onSelect || r.id === '__other'}
          >
            <div className="flex items-center justify-between gap-3 text-[12px] mb-1">
              <span className={clsx('inline-flex items-center gap-1.5 truncate', selectedId === r.id ? 'text-accent' : 'text-ink-2 group-hover:text-ink')}>
                <Swatch color={r.color} />
                <span className="truncate">{r.name}</span>
                {r.count !== undefined && <span className="num text-[10.5px] text-ink-3">×{r.count}</span>}
              </span>
              <span className="num text-ink whitespace-nowrap">
                {money(r.amountMinor)} <span className="text-ink-3 text-[10.5px]">{pct(r.pct, 0)}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(r.amountMinor / maxAmt) * 100}%`, background: r.color }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
