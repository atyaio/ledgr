import { Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { clsx } from 'clsx';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** Search / category / stakeholder filters, persisted in the URL next to the date range. */
export function useLedgerParams() {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  return {
    q: params.get('q') ?? '',
    categoryId: params.get('categoryId') ?? '',
    stakeholderId: params.get('stakeholderId') ?? '',
    sort: params.get('sort') ?? 'date',
    order: (params.get('order') ?? 'desc') as 'asc' | 'desc',
    page: Number(params.get('page') ?? '1') || 1,
    set,
  };
}

export function LedgerToolbar({
  categories,
  stakeholders,
  stakeholderLabel = 'Paid by',
  onExport,
  extra,
}: {
  categories: { id: string; name: string }[];
  stakeholders: { id: string; name: string }[];
  stakeholderLabel?: string;
  onExport?: () => void;
  extra?: ReactNode;
}) {
  const p = useLedgerParams();
  const activeFilters = [p.categoryId, p.stakeholderId].filter(Boolean).length;
  const [open, setOpen] = useState(activeFilters > 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
          <Input compact className="pl-9 h-10 md:h-9 rounded-full" placeholder="Search" value={p.q} onChange={(e) => p.set({ q: e.target.value || null })} />
          {p.q && (
            <button type="button" aria-label="Clear search" onClick={() => p.set({ q: null })} className="absolute right-2 top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded-full text-ink-3 hover:bg-card-hover">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={clsx('h-10 md:h-9 px-3 inline-flex items-center gap-1.5 rounded-full border text-[13.5px] font-medium', open || activeFilters ? 'bg-primary text-primary-ink border-primary' : 'bg-card border-line text-ink-2 hover:text-ink')}
        >
          <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">Filters</span>
          {activeFilters > 0 && <span className="num text-[12px] opacity-80">{activeFilters}</span>}
        </button>
        <div className="flex-1 hidden md:block" />
        {extra}
        {onExport && (
          <Button size="sm" variant="secondary" className="rounded-full max-md:hidden" icon={<Download className="size-4" />} onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>
      {open && (
        <div className="flex items-center gap-2 flex-wrap fade-up">
          <Select compact className="w-[180px]" value={p.categoryId} onChange={(e) => p.set({ categoryId: e.target.value || null })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select compact className="w-[180px]" value={p.stakeholderId} onChange={(e) => p.set({ stakeholderId: e.target.value || null })}>
            <option value="">{stakeholderLabel}: anyone</option>
            {stakeholders.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          {activeFilters > 0 && (
            <Button size="xs" variant="ghost" icon={<X className="size-3.5" />} onClick={() => p.set({ categoryId: null, stakeholderId: null })}>
              Clear
            </Button>
          )}
          {onExport && (
            <Button size="xs" variant="ghost" className="md:hidden" icon={<Download className="size-3.5" />} onClick={onExport}>
              Export CSV
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
