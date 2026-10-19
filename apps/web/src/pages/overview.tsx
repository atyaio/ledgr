import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { Link } from 'react-router';
import type { AnalyticsOverview, PaymentMethod } from '@atyaio/ledgr-shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useOverview, usePaymentMethods } from '@/lib/queries';
import { pct, signedPct } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Loading, Card, Meter, EmptyState } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Avatar, Swatch } from '@/components/ui/badge';
import { CashflowChart } from '@/components/charts/cashflow';
import { Breakdown } from '@/components/charts/breakdown';
import { Sparkline } from '@/components/charts/sparkline';
import { Button } from '@/components/ui/button';

export function OverviewPage() {
  const { t } = useI18n();
  const { locale } = useProject();
  const { range } = useDateRange();
  const q = useOverview(range.from, range.to);
  if (q.isPending) return <Loading label={t('Crunching the numbers')} />;
  if (q.isError) return <EmptyState title={t('Could not load analytics')} description={q.error.message} />;
  const o = q.data;
  const search = typeof location !== 'undefined' ? location.search : '';
  return (
    <div className={clsx('space-y-4', q.isFetching && 'opacity-80 transition-opacity')}>
      <Hero o={o} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 min-h-[320px]" title={t('Cashflow')}>
          {o.series.length ? <div className="h-[260px]"><CashflowChart series={o.series} granularity={o.range.granularity} /></div> : <EmptyState title={t('No entries in this range')} />}
        </Card>
        <Card title={t('Where the money went')} actions={<Link to={{ pathname: '/expenses', search }} className="text-[13px] font-medium text-accent inline-flex items-center">{t('All')} <ChevronRight className="size-4 rtl-flip" /></Link>}>
          <Breakdown items={o.expensesByCategory.map((c) => ({ id: c.categoryId, ...c }))} />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title={t('Partners')} subtitle={t('Balances for this period')} actions={<Link to={{ pathname: '/stakeholders', search: `${search ? search + '&' : '?'}tab=balances` }} className="text-[13px] font-medium text-accent inline-flex items-center">{t('Settle up')} <ChevronRight className="size-4 rtl-flip" /></Link>} flush>
          <Partners o={o} />
        </Card>
        <Card title={t('Budgets')} subtitle={o.budgets.length ? budgetMonthLabel(o.range.to, locale) : undefined}>
          <Budgets o={o} />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title={t('Largest expenses')} flush>
          <TopExpenses o={o} />
        </Card>
        <Card title={t('Revenue by category')}>
          <Breakdown items={o.revenueByCategory.map((c) => ({ id: c.categoryId, ...c }))} emptyLabel={t('No revenue in this range')} />
        </Card>
      </div>
      {((o.revenueByPaymentMethod ?? []).some((m) => m.paymentMethodId) || (o.expensesByPaymentMethod ?? []).some((m) => m.paymentMethodId)) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card title={t('Revenue by payment method')} subtitle={t('How customers paid')} actions={<Link to="/payments" className="text-[13px] font-medium text-accent inline-flex items-center">{t('Manage')} <ChevronRight className="size-4 rtl-flip" /></Link>}>
            <Breakdown items={(o.revenueByPaymentMethod ?? []).map((m) => ({ id: m.paymentMethodId, ...m }))} emptyLabel={t('No revenue in this range')} />
          </Card>
          <Card title={t('Expenses by payment method')} subtitle={t('How you paid')}>
            <Breakdown items={(o.expensesByPaymentMethod ?? []).map((m) => ({ id: m.paymentMethodId, ...m }))} emptyLabel={t('No expenses in this range')} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  const { t } = useI18n();
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3 text-[12.5px]">{t('no previous period')}</span>;
  if (Math.abs(value) < 0.05) value = 0;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[12.5px] font-medium', value === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-critical')}>
      <Icon className="size-3.5" /> {signedPct(value, 1)} <span className="text-ink-3 font-normal">{t('vs previous')}</span>
    </span>
  );
}

function Hero({ o }: { o: AnalyticsOverview }) {
  const { t } = useI18n();
  const { money } = useProject();
  const methodsQ = usePaymentMethods();
  const net = o.series.map((s) => s.netMinor);
  const methods = methodBoxes(o, methodsQ.data?.items ?? []);
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
      <div className="card p-5 col-span-2 md:col-span-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="label">{t('Net result')}</span>
            <Sparkline values={net} width={100} height={26} baseline />
          </div>
          <div className={clsx('num text-[32px] md:text-[28px] font-semibold tracking-[-0.02em] leading-none mt-2 whitespace-nowrap', o.totals.netMinor < 0 ? 'text-critical' : 'text-ink')}>{money(o.totals.netMinor, { signed: true })}</div>
          <div className="mt-2 whitespace-nowrap"><Delta value={o.delta.netPct} /></div>
        </div>
        <div className="text-[12.5px] text-ink-3 whitespace-nowrap">{t('Margin')} <span className="num text-ink font-medium">{o.totals.marginPct === null ? '—' : pct(o.totals.marginPct, 1)}</span></div>
      </div>
      {methods.map((m) => (
        <MethodCard key={m.id} m={m} />
      ))}
      <StatCard label={t('Revenue')} minor={o.totals.revenueMinor} tone="revenue" delta={<Delta value={o.delta.revenuePct} />} count={t('{n} entries', { n: o.totals.revenueCount })} values={o.series.map((s) => s.revenueMinor)} color="var(--s-revenue)" />
      <StatCard label={t('Expenses')} minor={o.totals.expenseMinor} tone="expense" delta={<Delta value={o.delta.expensePct} invert />} count={t('{n} entries', { n: o.totals.expenseCount })} values={o.series.map((s) => s.expenseMinor)} color="var(--s-expense)" />
    </div>
  );
}

interface MethodBox {
  id: string;
  name: string;
  nameAr?: string | null;
  color: string;
  inMinor: number;
  outMinor: number;
  count: number;
}

/** One box per payment method: every active method (in its configured order), plus any archived one that still has activity in the range. */
function methodBoxes(o: AnalyticsOverview, all: PaymentMethod[]): MethodBox[] {
  const byId = new Map<string, MethodBox>();
  const touch = (id: string | null, name: string, nameAr: string | null | undefined, color: string) => {
    if (!id) return null;
    let box = byId.get(id);
    if (!box) byId.set(id, (box = { id, name, nameAr, color, inMinor: 0, outMinor: 0, count: 0 }));
    return box;
  };
  for (const pm of all) if (!pm.archived) touch(pm.id, pm.name, pm.nameAr, pm.color);
  for (const r of o.revenueByPaymentMethod ?? []) {
    const box = touch(r.paymentMethodId, r.name, r.nameAr, r.color);
    if (box) { box.inMinor += r.amountMinor; box.count += r.count; }
  }
  for (const e of o.expensesByPaymentMethod ?? []) {
    const box = touch(e.paymentMethodId, e.name, e.nameAr, e.color);
    if (box) { box.outMinor += e.amountMinor; box.count += e.count; }
  }
  return [...byId.values()];
}

function MethodCard({ m }: { m: MethodBox }) {
  const { t, name } = useI18n();
  const { money } = useProject();
  const netMinor = m.inMinor - m.outMinor;
  return (
    <div className="card p-4 md:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 min-w-0"><Swatch color={m.color} size={9} /><span className="label truncate">{name(m)}</span></div>
        <div className={clsx('num text-[22px] md:text-[24px] font-semibold tracking-[-0.02em] leading-none mt-2 whitespace-nowrap', netMinor < 0 ? 'text-critical' : 'text-ink')}>{money(netMinor, { signed: true })}</div>
      </div>
      <div className="flex flex-col gap-0.5 text-[12px] text-ink-3">
        <span className="flex items-baseline justify-between gap-2"><span className="text-good">{t('In')}</span><span className="num text-ink-2 truncate">{money(m.inMinor)}</span></span>
        <span className="flex items-baseline justify-between gap-2"><span className="text-critical">{t('Out')}</span><span className="num text-ink-2 truncate">{money(m.outMinor)}</span></span>
        <span className="mt-0.5">{t('{n} entries', { n: m.count })}</span>
      </div>
    </div>
  );
}

function StatCard({ label, minor, delta, count, values, color, tone }: { label: string; minor: number; delta: React.ReactNode; count: string; values: number[]; color: string; tone: 'revenue' | 'expense' }) {
  const { money } = useProject();
  return (
    <div className="card p-4 md:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0"><Swatch color={color} size={9} /><span className="label truncate">{label}</span></span>
          <span className="hidden sm:block shrink-0"><Sparkline values={values} color={color} width={80} height={26} /></span>
        </div>
        <div className={clsx('num text-[22px] md:text-[24px] font-semibold tracking-[-0.02em] leading-none mt-2 whitespace-nowrap', tone === 'revenue' ? 'text-ink' : 'text-ink')}>{money(minor)}</div>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 whitespace-nowrap">
        {delta}
        <span className="text-[12px] text-ink-3">{count}</span>
      </div>
    </div>
  );
}

function Partners({ o }: { o: AnalyticsOverview }) {
  const { t, name } = useI18n();
  const { money } = useProject();
  if (!o.stakeholders.length) return <EmptyState title={t('No partners yet')} description={t('Add stakeholders and their ownership share to start splitting expenses.')} action={<Link to="/stakeholders"><Button variant="soft">{t('Add partners')}</Button></Link>} />;
  return (
    <ul className="divide-y divide-line">
      {o.stakeholders.map((s) => (
        <li key={s.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
          <Avatar name={name(s)} color={s.color} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-medium truncate">{name(s)} <span className="num text-[12.5px] text-ink-3 font-normal">{pct(s.sharePercent, 0)}</span></div>
            <div className="text-[12.5px] text-ink-3 truncate">{t('Paid {paid} · share {share}', { paid: money(s.paidMinor, { compact: true }), share: money(s.owedMinor, { compact: true }) })}<span className="hidden sm:inline"> · {t('profit')} {money(s.profitShareMinor, { compact: true, signed: true })}</span></div>
          </div>
          <div className="text-end shrink-0">
            <Money minor={s.netMinor} tone="flow" signed className="text-[15px] font-semibold block" />
            <span className="text-[11.5px] text-ink-3">{s.netMinor > 0 ? t('is owed') : s.netMinor < 0 ? t('owes') : t('settled')}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Budgets({ o }: { o: AnalyticsOverview }) {
  const { t, name } = useI18n();
  const { money } = useProject();
  if (!o.budgets.length) return <EmptyState title={t('No budgets')} description={t('Set a monthly budget on an expense category to track it here.')} action={<Link to="/categories"><Button variant="soft" size="sm">{t('Categories')}</Button></Link>} />;
  return (
    <ul className="space-y-4">
      {o.budgets.map((b) => (
        <li key={b.categoryId}>
          <div className="flex items-center justify-between text-[13.5px] mb-1.5">
            <span className="inline-flex items-center gap-2"><Swatch color={b.color} size={9} />{name(b)}</span>
            <span className="num"><span className={clsx('font-medium', b.pct >= 100 && 'text-critical')}>{money(b.spentMinor, { compact: true })}</span><span className="text-ink-3"> / {money(b.budgetMinor, { compact: true })}</span></span>
          </div>
          <Meter value={b.pct} />
          <div className={clsx('text-[12px] mt-1', b.pct >= 100 ? 'text-critical' : b.pct >= 85 ? 'text-warning' : 'text-ink-3')}>{b.remainingMinor >= 0 ? t('{amount} left', { amount: money(b.remainingMinor) }) : t('{amount} over budget', { amount: money(-b.remainingMinor) })}</div>
        </li>
      ))}
    </ul>
  );
}

function TopExpenses({ o }: { o: AnalyticsOverview }) {
  const { t, name } = useI18n();
  const { date } = useProject();
  if (!o.topExpenses.length) return <EmptyState title={t('No expenses in this range')} />;
  return (
    <ul className="divide-y divide-line">
      {o.topExpenses.slice(0, 6).map((e) => (
        <li key={e.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
          <span className="inline-flex items-center justify-center size-9 rounded-[12px] shrink-0" style={{ background: `${e.categoryColor}1f` }}><Swatch color={e.categoryColor} size={10} /></span>
          <div className="flex-1 min-w-0">
            <div dir="auto" className="text-[14.5px] font-medium truncate">{e.description}</div>
            <div className="text-[12.5px] text-ink-3 truncate">{name({ name: e.categoryName, nameAr: e.categoryNameAr })} · {date(e.date)}</div>
          </div>
          <Money minor={e.amountMinor} className="text-[15px] font-semibold shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function budgetMonthLabel(to: string, locale?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const m = (to < today ? to : today).slice(0, 7);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
}
