import { clsx } from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { RANGE_PRESETS, daysBetween, type RangePreset } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RangePicker({ className }: { className?: string }) {
  const { range, preset, setPreset, setRange, shift } = useDateRange();
  const { date } = useProject();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(range), [range]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const days = daysBetween(range.from, range.to) + 1;
  const label = range.from === range.to ? date(range.from, 'long') : `${date(range.from)} – ${date(range.to)}`;

  return (
    <div ref={ref} className={clsx('relative flex items-center gap-1.5', className)}>
      <div className="inline-flex items-stretch rounded-md border border-line bg-sunken overflow-hidden h-7">
        <button className="px-1.5 text-ink-3 hover:text-ink hover:bg-hover border-r border-line" onClick={() => shift(-1)} aria-label="Previous period">
          <ChevronLeft className="size-3.5" />
        </button>
        {RANGE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
          <button
            key={p.id}
            title={p.label}
            onClick={() => setPreset(p.id as RangePreset)}
            className={clsx(
              'px-2 text-[11.5px] font-medium num border-r border-line transition-colors',
              preset === p.id ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink hover:bg-hover',
            )}
          >
            {p.short}
          </button>
        ))}
        <button className="px-1.5 text-ink-3 hover:text-ink hover:bg-hover" onClick={() => shift(1)} aria-label="Next period">
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'h-7 inline-flex items-center gap-2 px-2.5 rounded-md border text-[12px] transition-colors',
          preset === 'custom' ? 'border-accent/50 bg-accent-soft text-ink' : 'border-line bg-sunken text-ink-2 hover:text-ink hover:border-line-strong',
        )}
      >
        <CalendarDays className="size-3.5 text-ink-3" />
        <span className="num whitespace-nowrap">{label}</span>
        <span className="num text-[10.5px] text-ink-3 hidden md:inline">· {days}d</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 panel bg-raised p-3 w-[300px] fade-up">
          <div className="eyebrow mb-2">Custom range</div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} mono />
            <Input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} mono />
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-1">
              {(['last7', 'last90', 'all'] as RangePreset[]).map((p) => (
                <Button key={p} size="xs" variant="ghost" onClick={() => { setPreset(p); setOpen(false); }}>
                  {p === 'last7' ? '7d' : p === 'last90' ? '90d' : 'All time'}
                </Button>
              ))}
            </div>
            <Button
              size="xs"
              variant="primary"
              disabled={!draft.from || !draft.to || draft.from > draft.to}
              onClick={() => {
                setRange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
