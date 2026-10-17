import { clsx } from 'clsx';
import { CATEGORICAL_PALETTE, type ShiftSalesResponse } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useI18n } from '@/i18n';
import { useShiftSales } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

/** Format a quantity: whole numbers plain, fractions to two decimals. */
export function qty(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
}

/** What sold during a pulled shift: per-category share, then the item lines. */
export function ShiftSalesList({ sales, compact }: { sales: ShiftSalesResponse; compact?: boolean }) {
  const { t } = useI18n();
  const { money, locale } = useProject();
  const net = sales.totals.netMinor;
  const pulled = sales.payments.filter((p) => p.pulled);
  const notPulled = sales.payments.filter((p) => !p.pulled && p.amountMinor !== 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('Receipts')} value={`${sales.totals.receipts}${sales.totals.refunds ? ` · ${t('{n} refunds', { n: sales.totals.refunds })}` : ''}`} />
        <Stat label={t('Items sold')} value={qty(sales.totals.quantity, locale)} />
        <Stat label={t('Net sales')} value={money(net, { compact: true })} hint={sales.totals.costMinor ? t('cost {amount}', { amount: money(sales.totals.costMinor, { compact: true }) }) : undefined} />
      </div>
      {(pulled.length > 0 || notPulled.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {pulled.map((p) => <Badge key={p.paymentTypeId} tone="revenue">{p.name} · {money(p.amountMinor, { compact: true })}</Badge>)}
          {notPulled.map((p) => <span key={p.paymentTypeId} title={t('Not pulled into the ledger')}><Badge className="opacity-80">{p.name} · {money(p.amountMinor, { compact: true })}</Badge></span>)}
        </div>
      )}
      {sales.byCategory.length > 1 && (
        <div>
          <div className="label mb-1.5">{t('By category')}</div>
          <div className="h-2.5 rounded-full bg-sunken overflow-hidden flex gap-[2px]">
            {sales.byCategory.map((c, i) => c.netMinor > 0 && <div key={c.name || '_'} className="h-full rounded-full" style={{ width: `${c.pct}%`, background: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length] }} title={`${c.name || t('Uncategorised')} ${money(c.netMinor)}`} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
            {sales.byCategory.map((c) => <li key={c.name || '_'}><span className="font-medium text-ink">{c.name || t('Uncategorised')}</span> <span className="num text-ink-3">{Math.round(c.pct)}%</span></li>)}
          </ul>
        </div>
      )}
      <ul className={clsx('divide-y divide-line rounded-[12px] border border-line overflow-hidden', compact && 'max-h-[320px] overflow-y-auto')}>
        {sales.lines.map((l, i) => (
          <li key={`${l.externalItemId ?? l.itemName}-${l.variantName ?? ''}-${i}`} className="flex items-center gap-3 px-3 py-2">
            <span className="num w-10 text-end text-[13px] text-ink-3 shrink-0">{qty(l.quantity, locale)}×</span>
            <span className="flex-1 min-w-0">
              <span dir="auto" className="block text-[13.5px] font-medium truncate">{l.itemName}{l.variantName ? <span className="text-ink-3 font-normal"> · {l.variantName}</span> : null}</span>
              {l.categoryName && <span className="block text-[11.5px] text-ink-3 truncate">{l.categoryName}</span>}
            </span>
            <span className="text-end shrink-0">
              <span className="num block text-[13.5px] font-medium">{money(l.netMinor)}</span>
              {net > 0 && <span className="num block text-[11px] text-ink-3">{Math.round((l.netMinor / net) * 100)}%</span>}
            </span>
          </li>
        ))}
        {!sales.lines.length && <li className="px-3 py-6 text-center text-[13px] text-ink-3">{t('No item lines on these receipts.')}</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] bg-sunken px-3 py-2 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-ink-3 truncate">{label}</div>
      <div className="num text-[15px] font-semibold truncate">{value}</div>
      {hint && <div className="text-[11px] text-ink-3 truncate">{hint}</div>}
    </div>
  );
}

/** Lazy-loading wrapper for a revenue row that came from a shift. */
export function ShiftSalesForRevenue({ shiftId }: { shiftId: string }) {
  const { t } = useI18n();
  const q = useShiftSales(shiftId);
  if (q.isPending) return <div className="py-6 flex justify-center"><Spinner className="size-5" /></div>;
  if (q.isError) return <div className="text-[13px] text-ink-3">{t('Could not load the shift sales.')}</div>;
  return <ShiftSalesList sales={q.data} compact />;
}
