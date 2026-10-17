import { Download, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
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
  const hasFilters = p.q || p.categoryId || p.stakeholderId;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative w-[240px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-3" />
        <Input className="pl-8 h-7" placeholder="Search description, vendor, notes…" value={p.q} onChange={(e) => p.set({ q: e.target.value || null })} />
      </div>
      <Select className="h-7 w-[170px]" value={p.categoryId} onChange={(e) => p.set({ categoryId: e.target.value || null })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      <Select className="h-7 w-[160px]" value={p.stakeholderId} onChange={(e) => p.set({ stakeholderId: e.target.value || null })}>
        <option value="">{stakeholderLabel}: anyone</option>
        {stakeholders.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </Select>
      {hasFilters && (
        <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => p.set({ q: null, categoryId: null, stakeholderId: null })}>
          Clear
        </Button>
      )}
      <div className="flex-1" />
      {extra}
      {onExport && (
        <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} onClick={onExport}>
          CSV
        </Button>
      )}
    </div>
  );
}
