import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Link } from 'react-router';
import type { AnalyticsOverview } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useOverview } from '@/lib/queries';
import { pct, signedPct } from '@/lib/format';
import { Loading, Panel, Meter, EmptyState } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Avatar, Chip, Swatch } from '@/components/ui/badge';
import { CashflowChart } from '@/components/charts/cashflow';
import { Breakdown } from '@/components/charts/breakdown';
import { Sparkline } from '@/components/charts/sparkline';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export function OverviewPage() {
  const { range } = useDateRange();
  const q = useOverview(range.from, range.to);
  if (q.isPending) return <Loading label="Crunching the ledger" />;
  if (q.isError) return <EmptyState title="Could not load analytics" description={q.error.message} />;
  const o = q.data;
  return (
    <div className={clsx('space-y-4', q.isFetching && 'opacity-80 transition-opacity')}>
      <Ticker o={o} />
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 xl:col-span-8 h-[340px]" title="Cashflow" eyebrow="01">
          {o.series.length ? <CashflowChart series={o.series} granularity={o.range.granularity} /> : <EmptyState title="No entries in this range" />}
        </Panel>
        <Panel className="col-span-12 xl:col-span-4 h-[340px]" title="Expenses by category" eyebrow="02" bodyClassName="overflow-y-auto">
          <Breakdown items={o.expensesByCategory.map((c) => ({ id: c.categoryId, ...c }))} />
        </Panel>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 xl:col-span-8" title="Stakeholders" eyebrow="03" actions={<Link to={{ pathname: '/stakeholders', search: location.search }}><Button size="xs" variant="ghost">Balances →</Button></Link>}>
          <StakeholderTable o={o} />
        </Panel>
        <Panel className="col-span-12 xl:col-span-4" title="Budgets" eyebrow="04" actions={<span className="eyebrow">{o.budgets.length ? budgetMonth(o.range.to) : ''}</span>}>
          <Budgets o={o} />
        </Panel>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 md:col-span-7" title="Largest expenses" eyebrow="05">
          <TopExpenses o={o} />
        </Panel>
        <Panel className="col-span-12 md:col-span-5" title="Revenue by category" eyebrow="06">
          <Breakdown items={o.revenueByCategory.map((c) => ({ id: c.categoryId, ...c }))} emptyLabel="No revenue in this range" />
        </Panel>
      </div>
    </div>
  );
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-4 num text-[11px]">— vs prev</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx('inline-flex items-center gap-0.5 num text-[11px]', value === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-critical')}>
      <Icon className="size-3" /> {signedPct(value, 1)} <span className="text-ink-3">vs prev</span>
    </span>
  );
}

function Ticker({ o }: { o: AnalyticsOverview }) {
  const { money } = useProject();
  const net = o.series.map((s) => s.netMinor);
  const rev = o.series.map((s) => s.revenueMinor);
  const exp = o.series.map((s) => s.expenseMinor);
  return (
    <div className="panel grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] divide-x divide-line overflow-hidden fade-up">
      <div className="p-4 relative overflow-hidden">
        <div className="absolute inset-0 grid-paper opacity-60 pointer-events-none" />
        <div className="relative">
          <div className="eyebrow">Net result</div>
          <div className={clsx('num text-[32px] font-medium leading-none mt-2 tracking-tight', o.totals.netMinor < 0 ? 'text-critical' : 'text-ink')}>{money(o.totals.netMinor, { signed: true })}</div>
          <div className="mt-2 flex items-center gap-3">
            <Delta value={o.delta.netPct} />
            <Sparkline values={net} baseline />
          </div>
        </div>
      </div>
      <Cell label="Revenue" value={money(o.totals.revenueMinor)} delta={<Delta value={o.delta.revenuePct} />} spark={<Sparkline values={rev} color="var(--s-revenue)" />} count={`${o.totals.revenueCount} entries`} />
      <Cell label="Expenses" value={money(o.totals.expenseMinor)} delta={<Delta value={o.delta.expensePct} invert />} spark={<Sparkline values={exp} color="var(--s-expense)" />} count={`${o.totals.expenseCount} entries`} />
      <Cell label="Margin" value={o.totals.marginPct === null ? '—' : pct(o.totals.marginPct, 1)} delta={<span className="text-[11px] text-ink-3 num">prev {money(o.previous.netMinor, { signed: true, compact: true })}</span>} count="net ÷ revenue" />
      <Cell label="Company pool" value={money(o.pool.netMinor, { signed: true, compact: true })} delta={<span className="text-[11px] text-ink-3 num">in {money(o.pool.revenueMinor, { compact: true })} · out {money(o.pool.expenseMinor, { compact: true })}</span>} count="unassigned flows" />
    </div>
  );
}

function Cell({ label, value, delta, spark, count }: { label: string; value: string; delta?: React.ReactNode; spark?: React.ReactNode; count?: string }) {
  return (
    <div className="p-4 flex flex-col justify-between gap-2">
      <div>
        <div className="eyebrow">{label}</div>
        <div className="num text-[20px] font-medium leading-none mt-2 tracking-tight">{value}</div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          {delta}
          {count && <span className="text-[10.5px] text-ink-3 num">{count}</span>}
        </div>
        {spark}
      </div>
    </div>
  );
}

function StakeholderTable({ o }: { o: AnalyticsOverview }) {
  if (!o.stakeholders.length) return <EmptyState title="No stakeholders yet" description="Add partners and their ownership share to start splitting expenses." />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Partner</Th>
          <Th align="right">Share</Th>
          <Th align="right">Owes (split)</Th>
          <Th align="right">Paid</Th>
          <Th align="right">Net balance</Th>
          <Th align="right">Revenue share</Th>
          <Th align="right">Profit share</Th>
        </tr>
      </thead>
      <tbody>
        {o.stakeholders.map((s) => (
          <Tr key={s.id}>
            <Td>
              <span className="inline-flex items-center gap-2">
                <Avatar name={s.name} color={s.color} />
                <span className="font-medium">{s.name}</span>
              </span>
            </Td>
            <Td align="right" className="num text-ink-2">{pct(s.sharePercent, 2)}</Td>
            <Td align="right"><Money minor={s.owedMinor} muted /></Td>
            <Td align="right"><Money minor={s.paidMinor} /></Td>
            <Td align="right"><Money minor={s.netMinor} tone="flow" signed /></Td>
            <Td align="right"><Money minor={s.revenueShareMinor} /></Td>
            <Td align="right"><Money minor={s.profitShareMinor} tone="flow" signed /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function Budgets({ o }: { o: AnalyticsOverview }) {
  const { money } = useProject();
  if (!o.budgets.length) return <EmptyState title="No budgets" description="Set a monthly budget on an expense category to track it here." action={<Link to="/categories"><Button size="xs">Categories</Button></Link>} />;
  return (
    <ul className="px-4 py-3 space-y-3">
      {o.budgets.map((b) => (
        <li key={b.categoryId}>
          <div className="flex items-center justify-between text-[12px] mb-1">
            <Chip color={b.color}>{b.name}</Chip>
            <span className="num">
              <span className={clsx(b.pct >= 100 ? 'text-critical' : 'text-ink')}>{money(b.spentMinor)}</span>
              <span className="text-ink-3"> / {money(b.budgetMinor)}</span>
              <span className={clsx('ml-2 text-[10.5px]', b.pct >= 100 ? 'text-critical' : b.pct >= 85 ? 'text-warning' : 'text-ink-3')}>{pct(b.pct, 0)}</span>
            </span>
          </div>
          <Meter value={b.pct} />
        </li>
      ))}
    </ul>
  );
}

function TopExpenses({ o }: { o: AnalyticsOverview }) {
  const { date } = useProject();
  if (!o.topExpenses.length) return <EmptyState title="No expenses in this range" />;
  const max = o.topExpenses[0]!.amountMinor || 1;
  return (
    <ul className="divide-y divide-line/70">
      {o.topExpenses.map((e, i) => (
        <li key={e.id} className="relative px-4 h-9 flex items-center gap-3 text-[12.5px] overflow-hidden">
          <span className="absolute left-0 top-0 bottom-0 bg-expense/10 pointer-events-none" style={{ width: `${(e.amountMinor / max) * 100}%` }} />
          <span className="num text-ink-4 w-4 text-[11px]">{String(i + 1).padStart(2, '0')}</span>
          <span className="num text-ink-3 w-16 shrink-0">{date(e.date, 'short')}</span>
          <span className="flex-1 truncate">{e.description}</span>
          <span className="inline-flex items-center gap-1.5 text-ink-3 text-[11.5px] shrink-0"><Swatch color={e.categoryColor} />{e.categoryName}</span>
          <Money minor={e.amountMinor} className="w-28 text-right shrink-0" />
        </li>
      ))}
    </ul>
  );
}

function budgetMonth(to: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return (to < today ? to : today).slice(0, 7);
}
