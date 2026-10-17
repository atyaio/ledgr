import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, CreditCard, Minus, Tags, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { InsightsGroup, InsightsLedger, InsightsResponse } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useInsights, usePaymentMethods, useStakeholders } from '@/lib/queries';
import { pct, signedPct } from '@/lib/format';
import { Card, EmptyState, Loading, PageHeader, Segmented } from '@/components/ui/misc';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { Swatch } from '@/components/ui/badge';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ChartTooltip, Legend } from '@/components/charts/tooltip';
import { Breakdown } from '@/components/charts/breakdown';

const LEDGERS: { id: InsightsLedger; label: string }[] = [
  { id: 'both', label: 'Both' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
];

export function InsightsPage() {
  const { range } = useDateRange();
  const [params, setParams] = useSearchParams();
  const ledger = (params.get('ledger') as InsightsLedger) || 'both';
  const categoryIds = (params.get('cats') ?? '').split(',').filter(Boolean);
  const methodIds = (params.get('methods') ?? '').split(',').filter(Boolean);
  const stakeholderId = params.get('partner') ?? '';
  const granularity = (params.get('g') as 'day' | 'week' | 'month' | null) ?? '';
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => { const n = new URLSearchParams(prev); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return n; }, { replace: true });

  const cats = useCategories(undefined, false);
  const pm = usePaymentMethods();
  const sh = useStakeholders();
  const q = useInsights(useMemo(() => ({ from: range.from, to: range.to, ledger, categoryIds: categoryIds.join(',') || undefined, paymentMethodIds: methodIds.join(',') || undefined, stakeholderId: stakeholderId || undefined, granularity: granularity || undefined }), [range, ledger, categoryIds.join(','), methodIds.join(','), stakeholderId, granularity]));

  const catOptions = useMemo(() => (cats.data?.items ?? []).filter((c) => ledger === 'both' || c.kind === (ledger === 'revenue' ? 'revenue' : 'expense')).map((c) => ({ id: c.id, label: c.name, color: c.color, hint: c.kind })), [cats.data, ledger]);
  const methodOptions = useMemo(() => (pm.data?.items ?? []).map((m) => ({ id: m.id, label: m.name, color: m.color })), [pm.data]);

  return (
    <>
      <PageHeader title="Insights" subtitle="Slice the ledger by category, payment method and partner, compared with the previous period." />
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Segmented value={ledger} onChange={(v) => set({ ledger: v === 'both' ? null : v, cats: null })} items={LEDGERS} />
        <MultiSelect label="Categories" icon={<Tags className="size-4" />} options={catOptions} value={categoryIds} onChange={(ids) => set({ cats: ids.join(',') || null })} />
        <MultiSelect label="Payment" icon={<CreditCard className="size-4" />} options={methodOptions} value={methodIds} onChange={(ids) => set({ methods: ids.join(',') || null })} />
        <div className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-full border border-line bg-card text-[13.5px] text-ink-2">
          <Users className="size-4" />
          <Select compact className="h-7 border-0 bg-transparent pl-1 pr-7 w-[150px] rounded-full" value={stakeholderId} onChange={(e) => set({ partner: e.target.value || null })}>
            <option value="">Partner: all</option>
            {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div className="flex-1" />
        <Segmented size="xs" value={granularity || 'auto'} onChange={(v) => set({ g: v === 'auto' ? null : v })} items={[{ id: 'auto', label: 'Auto' }, { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} />
      </div>

      {q.isPending && <Loading label="Slicing the ledger" />}
      {q.isError && <EmptyState title="Could not load insights" description={q.error.message} />}
      {q.data && <Body d={q.data} ledger={ledger} filtered={!!(categoryIds.length || methodIds.length || stakeholderId)} />}
    </>
  );
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3 text-[12px]">no previous period</span>;
  if (Math.abs(value) < 0.05) value = 0;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return <span className={clsx('inline-flex items-center gap-0.5 text-[12px] font-medium', value === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-critical')}><Icon className="size-3.5" />{signedPct(value, 1)} <span className="font-normal text-ink-3">vs previous</span></span>;
}

function Body({ d, ledger, filtered }: { d: InsightsResponse; ledger: InsightsLedger; filtered: boolean }) {
  const { money, date } = useProject();
  const showRev = ledger !== 'expenses';
  const showExp = ledger !== 'revenue';
  const t = d.totals;
  return (
    <div className={clsx('space-y-4', filtered && 'fade-up')}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {showRev && <Kpi label="Revenue" value={money(t.revenueMinor)} sub={<Delta value={d.delta.revenuePct} />} extra={`${t.revenueCount} entries · avg ${money(t.avgRevenuePerEntryMinor, { compact: true })}`} />}
        {showExp && <Kpi label="Expenses" value={money(t.expenseMinor)} sub={<Delta value={d.delta.expensePct} invert />} extra={`${t.expenseCount} entries · avg ${money(t.avgExpensePerEntryMinor, { compact: true })}`} />}
        {showRev && showExp && <Kpi label="Net" value={money(t.netMinor, { signed: true })} tone={t.netMinor < 0 ? 'bad' : undefined} sub={<Delta value={d.delta.netPct} />} extra={t.marginPct === null ? 'no revenue' : `margin ${pct(t.marginPct, 1)}`} />}
        {showRev ? (
          <Kpi label="Per day" value={money(t.avgRevenuePerDayMinor)} sub={<span className="text-[12px] text-ink-3">{t.activeDays} of {d.range.days} days active</span>} extra={t.bestDay ? `best ${date(t.bestDay.date, 'short')} · ${money(t.bestDay.revenueMinor, { compact: true })}` : undefined} />
        ) : (
          <Kpi label="Per day" value={money(t.avgExpensePerDayMinor)} sub={<span className="text-[12px] text-ink-3">{t.activeDays} of {d.range.days} days active</span>} />
        )}
      </div>

      <Card title="Trend" subtitle={`By ${d.range.granularity} · dotted line is the previous period (${date(d.range.previousFrom, 'short')} – ${date(d.range.previousTo)})`}>
        <div className="h-[280px]"><Trend d={d} showRev={showRev} showExp={showExp} /></div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {showRev && <Card title="Revenue by category"><Breakdown items={d.revenueByCategory.map((g) => ({ id: g.id, name: g.name, color: g.color, amountMinor: g.revenueMinor, pct: g.pct, count: g.count }))} emptyLabel="No revenue" /></Card>}
        {showExp && <Card title="Expenses by category"><Breakdown items={d.expensesByCategory.map((g) => ({ id: g.id, name: g.name, color: g.color, amountMinor: g.expenseMinor, pct: g.pct, count: g.count }))} emptyLabel="No expenses" /></Card>}
        <Card title="By payment method" subtitle={showRev && showExp ? 'Revenue and expenses combined' : undefined}><GroupList groups={d.byPaymentMethod} showRev={showRev} showExp={showExp} /></Card>
        <Card title="By partner" subtitle="Received by / paid by"><GroupList groups={d.byStakeholder} showRev={showRev} showExp={showExp} /></Card>
        <Card title="Weekday pattern" subtitle="Average per day of the week" className={clsx(showRev && showExp && 'xl:col-span-2')}>
          <div className="h-[220px]"><Weekday d={d} showRev={showRev} showExp={showExp} /></div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Month by month" flush>
          <Table>
            <thead><tr><Th>Month</Th>{showRev && <Th align="right">Revenue</Th>}{showExp && <Th align="right">Expenses</Th>}{showRev && showExp && <><Th align="right">Net</Th><Th align="right">Margin</Th></>}<Th align="right">Entries</Th></tr></thead>
            <tbody>
              {d.byMonth.map((m) => (
                <Tr key={m.month}>
                  <Td className="font-medium">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m.month}-01T00:00:00Z`))}</Td>
                  {showRev && <Td align="right"><Money minor={m.revenueMinor} /></Td>}
                  {showExp && <Td align="right"><Money minor={m.expenseMinor} /></Td>}
                  {showRev && showExp && <><Td align="right"><Money minor={m.netMinor} tone="flow" signed /></Td><Td align="right" className="num text-ink-2">{m.marginPct === null ? '—' : pct(m.marginPct, 0)}</Td></>}
                  <Td align="right" className="num text-ink-2">{(showRev ? m.revenueCount : 0) + (showExp ? m.expenseCount : 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title={showRev ? 'Largest revenue' : 'Largest expenses'} flush>
          <ul className="divide-y divide-line">
            {(showRev ? d.topRevenue : d.topExpenses).slice(0, 8).map((e) => (
              <li key={e.id} className="px-4 md:px-5 py-2.5 flex items-center gap-3">
                <Swatch color={e.groupColor} size={9} />
                <div className="flex-1 min-w-0"><div className="text-[14px] font-medium truncate">{e.description}</div><div className="text-[12px] text-ink-3">{e.groupName} · {date(e.date)}</div></div>
                <Money minor={e.amountMinor} className="font-semibold" />
              </li>
            ))}
            {!(showRev ? d.topRevenue : d.topExpenses).length && <li><EmptyState title="Nothing here" /></li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, extra, tone }: { label: string; value: string; sub?: React.ReactNode; extra?: string; tone?: 'bad' }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={clsx('num text-[22px] md:text-[24px] font-semibold tracking-tight mt-1', tone === 'bad' && 'text-critical')}>{value}</div>
      <div className="mt-1 min-h-[18px]">{sub}</div>
      {extra && <div className="text-[12px] text-ink-3 mt-0.5 truncate">{extra}</div>}
    </div>
  );
}

function GroupList({ groups, showRev, showExp }: { groups: InsightsGroup[]; showRev: boolean; showExp: boolean }) {
  const { money } = useProject();
  if (!groups.length) return <div className="text-[13.5px] text-ink-3 py-8 text-center">Nothing in this range</div>;
  const total = (g: InsightsGroup) => (showRev ? g.revenueMinor : 0) + (showExp ? g.expenseMinor : 0);
  const max = Math.max(1, ...groups.map(total));
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.id ?? 'none'}>
          <div className="flex items-center justify-between text-[13.5px] mb-1.5">
            <span className="inline-flex items-center gap-2 truncate"><Swatch color={g.color} size={9} />{g.name}<span className="num text-[12px] text-ink-3">{g.count}</span></span>
            <span className="num font-medium">{money(total(g))}{showRev && showExp && g.revenueMinor && g.expenseMinor ? <span className="text-ink-3 font-normal text-[12px]"> · in {money(g.revenueMinor, { compact: true })} / out {money(g.expenseMinor, { compact: true })}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-sunken overflow-hidden flex gap-[2px]">
            {showRev && g.revenueMinor > 0 && <div className="h-full rounded-full" style={{ width: `${(g.revenueMinor / max) * 100}%`, background: showExp ? 'var(--s-revenue)' : g.color }} />}
            {showExp && g.expenseMinor > 0 && <div className="h-full rounded-full" style={{ width: `${(g.expenseMinor / max) * 100}%`, background: showRev ? 'var(--s-expense)' : g.color }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Trend({ d, showRev, showExp }: { d: InsightsResponse; showRev: boolean; showExp: boolean }) {
  const { money, date, toMajor, locale } = useProject();
  const g = d.range.granularity;
  const fmtAxis = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(v));
  const fmtBucket = (b: string) => (g === 'month' ? new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${b}T00:00:00Z`)) : date(b, 'short'));
  const data = d.series.map((s) => ({ ...s, label: fmtBucket(s.bucket) }));
  const legend = [
    ...(showRev ? [{ label: 'Revenue', color: 'var(--s-revenue)' }] : []),
    ...(showExp ? [{ label: 'Expenses', color: 'var(--s-expense)' }] : []),
    { label: 'Previous period', color: 'var(--ink-3)', kind: 'line' as const },
  ];
  return (
    <div className="h-full flex flex-col">
      <div className="pb-2"><Legend items={legend} /></div>
      <div className="flex-1 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'var(--card-hover)', opacity: 0.8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof data)[number];
                return (
                  <ChartTooltip
                    title={g === 'day' ? date(p.bucket, 'long') : g === 'week' ? `Week of ${date(p.bucket)}` : fmtBucket(p.bucket)}
                    rows={[
                      ...(showRev ? [{ label: 'Revenue', value: `${money(p.revenueMinor)} · ${p.revenueCount}`, color: 'var(--s-revenue)' }, { label: 'Prev. revenue', value: money(p.prevRevenueMinor) }] : []),
                      ...(showExp ? [{ label: 'Expenses', value: `${money(p.expenseMinor)} · ${p.expenseCount}`, color: 'var(--s-expense)' }, { label: 'Prev. expenses', value: money(p.prevExpenseMinor) }] : []),
                    ]}
                  />
                );
              }}
            />
            {showRev && <Bar dataKey="revenueMinor" fill="var(--s-revenue)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
            {showExp && <Bar dataKey="expenseMinor" fill="var(--s-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
            {showRev && <Line type="monotone" dataKey="prevRevenueMinor" stroke="var(--s-revenue)" strokeDasharray="4 4" strokeOpacity={0.7} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
            {showExp && <Line type="monotone" dataKey="prevExpenseMinor" stroke="var(--s-expense)" strokeDasharray="4 4" strokeOpacity={0.7} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Weekday({ d, showRev, showExp }: { d: InsightsResponse; showRev: boolean; showExp: boolean }) {
  const { money, toMajor, locale } = useProject();
  const fmtAxis = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(v));
  const data = d.byWeekday.map((w) => ({ ...w, label: w.label.slice(0, 3) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -8 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'var(--card-hover)', opacity: 0.8 }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const p = payload[0]!.payload as (typeof data)[number]; return <ChartTooltip title={`${p.label} · ${p.days} days`} rows={[...(showRev ? [{ label: 'Avg revenue', value: money(p.avgRevenueMinor), color: 'var(--s-revenue)' }] : []), ...(showExp ? [{ label: 'Avg expenses', value: money(p.avgExpenseMinor), color: 'var(--s-expense)' }] : [])]} />; }} />
        {showRev && <Bar dataKey="avgRevenueMinor" fill="var(--s-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
        {showExp && <Bar dataKey="avgExpenseMinor" fill="var(--s-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
      </BarChart>
    </ResponsiveContainer>
  );
}
