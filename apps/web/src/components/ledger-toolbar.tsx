import { Download, FileSpreadsheet, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import { Menu, MenuItem } from '@/components/ui/menu';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { clsx } from 'clsx';
import { useI18n } from '@/i18n';
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
    paymentMethodId: params.get('paymentMethodId') ?? '',
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
  paymentMethods,
  onExport,
  extra,
}: {
  categories: { id: string; name: string; nameAr?: string | null }[];
  stakeholders: { id: string; name: string; nameAr?: string | null }[];
  /** When given, a payment-method filter is shown (revenue). */
  paymentMethods?: { id: string; name: string; nameAr?: string | null }[];
  /** English label key, e.g. "Paid by" / "Received by"; translated here. */
  stakeholderLabel?: string;
  /** Called with the format the user picked. */
  onExport?: (format: 'xlsx' | 'csv') => void;
  extra?: ReactNode;
}) {
  const { t, name } = useI18n();
  const p = useLedgerParams();
  const activeFilters = [p.categoryId, p.stakeholderId, paymentMethods ? p.paymentMethodId : ''].filter(Boolean).length;
  const [open, setOpen] = useState(activeFilters > 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:max-w-[320px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
          <Input compact className="ps-9 h-10 md:h-9 rounded-full" placeholder={t('Search')} value={p.q} onChange={(e) => p.set({ q: e.target.value || null })} />
          {p.q && (
            <button type="button" aria-label={t('Clear search')} onClick={() => p.set({ q: null })} className="absolute end-2 top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded-full text-ink-3 hover:bg-card-hover">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={clsx('h-10 md:h-9 px-3 inline-flex items-center gap-1.5 rounded-full border text-[13.5px] font-medium', open || activeFilters ? 'bg-primary text-primary-ink border-primary' : 'bg-card border-line text-ink-2 hover:text-ink')}
        >
          <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">{t('Filters')}</span>
          {activeFilters > 0 && <span className="num text-[12px] opacity-80">{activeFilters}</span>}
        </button>
        <div className="flex-1 hidden md:block" />
        {extra}
        {onExport && (
          <Menu align="right" className="max-md:hidden" trigger={() => <Button size="sm" variant="secondary" className="rounded-full" icon={<Download className="size-4" />}>{t('Export')}</Button>}>
            {(close) => (
              <>
                <MenuItem icon={<FileSpreadsheet />} onClick={() => { close(); onExport('xlsx'); }}>{t('Excel (.xlsx), with dropdowns')}</MenuItem>
                <MenuItem icon={<FileText />} onClick={() => { close(); onExport('csv'); }}>{t('CSV')}</MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
      {open && (
        <div className="flex items-center gap-2 flex-wrap fade-up">
          <Select compact className="w-[180px]" value={p.categoryId} onChange={(e) => p.set({ categoryId: e.target.value || null })}>
            <option value="">{t('All categories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{name(c)}</option>
            ))}
          </Select>
          <Select compact className="w-[180px]" value={p.stakeholderId} onChange={(e) => p.set({ stakeholderId: e.target.value || null })}>
            <option value="">{t('{label}: anyone', { label: t(stakeholderLabel) })}</option>
            {stakeholders.map((s) => (
              <option key={s.id} value={s.id}>{name(s)}</option>
            ))}
          </Select>
          {paymentMethods && (
            <Select compact className="w-[180px]" value={p.paymentMethodId} onChange={(e) => p.set({ paymentMethodId: e.target.value || null })}>
              <option value="">{t('All payment methods')}</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{name(m)}</option>
              ))}
            </Select>
          )}
          {activeFilters > 0 && (
            <Button size="xs" variant="ghost" icon={<X className="size-3.5" />} onClick={() => p.set({ categoryId: null, stakeholderId: null, paymentMethodId: null })}>
              {t('Clear')}
            </Button>
          )}
          {onExport && (
            <>
              <Button size="xs" variant="ghost" className="md:hidden" icon={<Download className="size-3.5" />} onClick={() => onExport('xlsx')}>{t('Excel')}</Button>
              <Button size="xs" variant="ghost" className="md:hidden" onClick={() => onExport('csv')}>{t('CSV')}</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
