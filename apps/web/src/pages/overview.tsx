import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { Link } from 'react-router';
import type { AnalyticsOverview } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useOverview } from '@/lib/queries';
import { pct, signedPct } from '@/lib/format';
import { Loading, Card, Meter, EmptyState } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Avatar, Swatch } from '@/components/ui/badge';
import { CashflowChart } from '@/components/charts/cashflow';
import { Breakdown } from '@/components/charts/breakdown';
import { Sparkline } from '@/components/charts/sparkline';
import { Button } from '@/components/ui/button';

export function OverviewPage() {
  const { range } = useDateRange();
  const q = useOverview(range.from, range.to);
  if (q.isPending) return <Loading label="Crunching the numbers" />;
  if (q.isError) return <EmptyState title="Could not load analytics" description={q.error.message} />;
  const o = q.data;
  const search = typeof location !== 'undefined' ? location.search : '';
  return (
    <div className={clsx('space-y-4', q.isFetching && 'opacity-80 transition-opacity')}>
      <Hero o={o} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 min-h-[320px]" title="Cashflow">
          {o.series.length ? <div className="h-[260px]"><CashflowChart series={o.series} granularity={o.range.granularity} /></div> : <EmptyState title="No entries in this range" />}
        </Card>
        <Card title="Where the money went" actions={<Link to={{ pathname: '/expenses', search }} className="text-[13px] font-medium text-accent inline-flex items-center">All <ChevronRight className="size-4" /></Link>}>
          <Breakdown items={o.expensesByCategory.map((c) => ({ id: c.categoryId, ...c }))} />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Partners" subtitle="Balances for this period" actions={<Link to={{ pathname: '/stakeholders', search: `${search ? search + '&' : '?'}tab=balances` }} className="text-[13px] font-medium text-accent inline-flex items-center">Settle up <ChevronRight className="size-4" /></Link>} flush>
          <Partners o={o} />
        </Card>
        <Card title="Budgets" subtitle={o.budgets.length ? budgetMonthLabel(o.range.to) : undefined}>
          <Budgets o={o} />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Largest expenses" flush>
          <TopExpenses o={o} />
        </Card>
        <Card title="Revenue by category">
          <Breakdown items={o.revenueByCategory.map((c) => ({ id: c.categoryId, ...c }))} emptyLabel="No revenue in this range" />
        </Card>
      </div>
    </div>
  );
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3 text-[12.5px]">no previous period</span>;
  if (Math.abs(value) < 0.05) value = 0;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[12.5px] font-medium', value === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-critical')}>
      <Icon className="size-3.5" /> {signedPct(value, 1)} <span className="text-ink-3 font-normal">vs previous</span>
    </span>
  );
}

function Hero({ o }: { o: AnalyticsOverview }) {
  const { money } = useProject();
  const net = o.series.map((s) => s.netMinor);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
      <div className="card p-5 md:col-span-1 flex flex-col justify-between gap-4">
        <div>
          <div className="label">Net result</div>
          <div className={clsx('num text-[34px] md:text-[36px] font-semibold tracking-[-0.02em] leading-none mt-2', o.totals.netMinor < 0 ? 'text-critical' : 'text-ink')}>{money(o.totals.netMinor, { signed: true })}</div>
          <div className="mt-2"><Delta value={o.delta.netPct} /></div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="text-[12.5px] text-ink-3">Margin <span className="num text-ink font-medium">{o.totals.marginPct === null ? '—' : pct(o.totals.marginPct, 1)}</span></div>
          <Sparkline values={net} width={120} height={32} baseline />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:col-span-2">
        <StatCard label="Revenue" minor={o.totals.revenueMinor} tone="revenue" delta={<Delta value={o.delta.revenuePct} />} count={`${o.totals.revenueCount} entries`} values={o.series.map((s) => s.revenueMinor)} color="var(--s-revenue)" />
        <StatCard label="Expenses" minor={o.totals.expenseMinor} tone="expense" delta={<Delta value={o.delta.expensePct} invert />} count={`${o.totals.expenseCount} entries`} values={o.series.map((s) => s.expenseMinor)} color="var(--s-expense)" />
      </div>
    </div>
  );
}

function StatCard({ label, minor, delta, count, values, color, tone }: { label: string; minor: number; delta: React.ReactNode; count: string; values: number[]; color: string; tone: 'revenue' | 'expense' }) {
  const { money } = useProject();
  return (
    <div className="card p-4 md:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Swatch color={color} size={8} /><span className="label">{label}</span></div>
        <div className={clsx('num text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] leading-none mt-2', tone === 'revenue' ? 'text-ink' : 'text-ink')}>{money(minor)}</div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          {delta}
          <span className="text-[12px] text-ink-3">{count}</span>
        </div>
        <span className="hidden sm:block"><Sparkline values={values} color={color} width={80} height={26} /></span>
      </div>
    </div>
  );
}

function Partners({ o }: { o: AnalyticsOverview }) {
  const { money } = useProject();
  if (!o.stakeholders.length) return <EmptyState title="No partners yet" description="Add stakeholders and their ownership share to start splitting expenses." action={<Link to="/stakeholders"><Button variant="soft">Add partners</Button></Link>} />;
  return (
    <ul className="divide-y divide-line">
      {o.stakeholders.map((s) => (
        <li key={s.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
          <Avatar name={s.name} color={s.color} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-medium truncate">{s.name} <span className="num text-[12.5px] text-ink-3 font-normal">{pct(s.sharePercent, 0)}</span></div>
            <div className="text-[12.5px] text-ink-3 truncate">Paid {money(s.paidMinor, { compact: true })} · share {money(s.owedMinor, { compact: true })}<span className="hidden sm:inline"> · profit {money(s.profitShareMinor, { compact: true, signed: true })}</span></div>
          </div>
          <div className="text-right shrink-0">
            <Money minor={s.netMinor} tone="flow" signed className="text-[15px] font-semibold block" />
            <span className="text-[11.5px] text-ink-3">{s.netMinor > 0 ? 'is owed' : s.netMinor < 0 ? 'owes' : 'settled'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Budgets({ o }: { o: AnalyticsOverview }) {
  const { money } = useProject();
  if (!o.budgets.length) return <EmptyState title="No budgets" description="Set a monthly budget on an expense category to track it here." action={<Link to="/categories"><Button variant="soft" size="sm">Categories</Button></Link>} />;
  return (
    <ul className="space-y-4">
      {o.budgets.map((b) => (
        <li key={b.categoryId}>
          <div className="flex items-center justify-between text-[13.5px] mb-1.5">
            <span className="inline-flex items-center gap-2"><Swatch color={b.color} size={9} />{b.name}</span>
            <span className="num"><span className={clsx('font-medium', b.pct >= 100 && 'text-critical')}>{money(b.spentMinor, { compact: true })}</span><span className="text-ink-3"> / {money(b.budgetMinor, { compact: true })}</span></span>
          </div>
          <Meter value={b.pct} />
          <div className={clsx('text-[12px] mt-1', b.pct >= 100 ? 'text-critical' : b.pct >= 85 ? 'text-warning' : 'text-ink-3')}>{b.remainingMinor >= 0 ? `${money(b.remainingMinor)} left` : `${money(-b.remainingMinor)} over budget`}</div>
        </li>
      ))}
    </ul>
  );
}

function TopExpenses({ o }: { o: AnalyticsOverview }) {
  const { date } = useProject();
  if (!o.topExpenses.length) return <EmptyState title="No expenses in this range" />;
  return (
    <ul className="divide-y divide-line">
      {o.topExpenses.slice(0, 6).map((e) => (
        <li key={e.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
          <span className="inline-flex items-center justify-center size-9 rounded-[12px] shrink-0" style={{ background: `${e.categoryColor}1f` }}><Swatch color={e.categoryColor} size={10} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-medium truncate">{e.description}</div>
            <div className="text-[12.5px] text-ink-3 truncate">{e.categoryName} · {date(e.date)}</div>
          </div>
          <Money minor={e.amountMinor} className="text-[15px] font-semibold shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function budgetMonthLabel(to: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const m = (to < today ? to : today).slice(0, 7);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
}
