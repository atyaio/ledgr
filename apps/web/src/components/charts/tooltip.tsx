import type { ReactNode } from 'react';

export function ChartTooltip({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="chart-tooltip min-w-[160px]">
      <div className="label mb-1.5">{title}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              {r.color && <span className="inline-block size-2.5 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="num text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'bar' | 'line' }[] }) {
  return (
    <div className="flex items-center gap-4 text-[12.5px] text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === 'line' ? <span className="inline-block w-3 h-0.5 rounded" style={{ background: it.color }} /> : <span className="inline-block size-2.5 rounded-full" style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}
