import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, CreditCard, Minus, Tags, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { InsightsGroup, InsightsLedger, InsightsResponse } from '@atyaio/ledgr-shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useInsights, usePaymentMethods, useStakeholders } from '@/lib/queries';
import { pct, signedPct } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Card, EmptyState, Loading, PageHeader, Segmented } from '@/components/ui/misc';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { Swatch } from '@/components/ui/badge';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ChartTooltip, Legend } from '@/components/charts/tooltip';
import { Breakdown } from '@/components/charts/breakdown';
import { qty } from '@/components/integrations/shift-sales';
import { CATEGORICAL_PALETTE } from '@atyaio/ledgr-shared';

const LEDGERS: { id: InsightsLedger; label: string }[] = [
  { id: 'both', label: 'Both' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
];

export function InsightsPage() {
  const { t, name } = useI18n();
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

  const catOptions = useMemo(() => (cats.data?.items ?? []).filter((c) => ledger === 'both' || c.kind === (ledger === 'revenue' ? 'revenue' : 'expense')).map((c) => ({ id: c.id, label: name(c), color: c.color, hint: t(c.kind) })), [cats.data, ledger, name, t]);
  const methodOptions = useMemo(() => (pm.data?.items ?? []).map((m) => ({ id: m.id, label: name(m), color: m.color })), [pm.data, name]);

  return (
    <>
      <PageHeader title={t('Insights')} subtitle={t('Slice the ledger by category, payment method and partner, compared with the previous period.')} />
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Segmented value={ledger} onChange={(v) => set({ ledger: v === 'both' ? null : v, cats: null })} items={LEDGERS.map((l) => ({ id: l.id, label: t(l.label) }))} />
        <MultiSelect label={t('Categories')} icon={<Tags className="size-4" />} options={catOptions} value={categoryIds} onChange={(ids) => set({ cats: ids.join(',') || null })} />
        <MultiSelect label={t('Payment')} icon={<CreditCard className="size-4" />} options={methodOptions} value={methodIds} onChange={(ids) => set({ methods: ids.join(',') || null })} />
        <div className="inline-flex items-center gap-1.5 h-9 ps-3 pe-1 rounded-full border border-line bg-card text-[13.5px] text-ink-2">
          <Users className="size-4" />
          <Select compact className="h-7 border-0 bg-transparent ps-1 pe-7 w-[150px] rounded-full" value={stakeholderId} onChange={(e) => set({ partner: e.target.value || null })}>
            <option value="">{t('Partner: all')}</option>
            {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
          </Select>
        </div>
        <div className="flex-1" />
        <Segmented size="xs" value={granularity || 'auto'} onChange={(v) => set({ g: v === 'auto' ? null : v })} items={[{ id: 'auto', label: t('Auto') }, { id: 'day', label: t('Day') }, { id: 'week', label: t('Week') }, { id: 'month', label: t('Month') }]} />
      </div>

      {q.isPending && <Loading label={t('Slicing the ledger')} />}
      {q.isError && <EmptyState title={t('Could not load insights')} description={q.error.message} />}
      {q.data && <Body d={q.data} ledger={ledger} filtered={!!(categoryIds.length || methodIds.length || stakeholderId)} />}
    </>
  );
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  const { t } = useI18n();
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3 text-[12px]">{t('no previous period')}</span>;
  if (Math.abs(value) < 0.05) value = 0;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return <span className={clsx('inline-flex items-center gap-0.5 text-[12px] font-medium', value === 0 ? 'text-ink-3' : good ? 'text-good' : 'text-critical')}><Icon className="size-3.5" />{signedPct(value, 1)} <span className="font-normal text-ink-3">{t('vs previous')}</span></span>;
}

function Body({ d, ledger, filtered }: { d: InsightsResponse; ledger: InsightsLedger; filtered: boolean }) {
  const { t: tr, lang } = useI18n();
  const { money, date } = useProject();
  const showRev = ledger !== 'expenses';
  const showExp = ledger !== 'revenue';
  const t = d.totals;
  return (
    <div className={clsx('space-y-4', filtered && 'fade-up')}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {showRev && <Kpi label={tr('Revenue')} value={money(t.revenueMinor)} sub={<Delta value={d.delta.revenuePct} />} extra={tr('{n} entries · avg {avg}', { n: t.revenueCount, avg: money(t.avgRevenuePerEntryMinor, { compact: true }) })} />}
        {showExp && <Kpi label={tr('Expenses')} value={money(t.expenseMinor)} sub={<Delta value={d.delta.expensePct} invert />} extra={tr('{n} entries · avg {avg}', { n: t.expenseCount, avg: money(t.avgExpensePerEntryMinor, { compact: true }) })} />}
        {showRev && showExp && <Kpi label={tr('Net')} value={money(t.netMinor, { signed: true })} tone={t.netMinor < 0 ? 'bad' : undefined} sub={<Delta value={d.delta.netPct} />} extra={t.marginPct === null ? tr('no revenue') : tr('margin {pct}', { pct: pct(t.marginPct, 1) })} />}
        {showRev ? (
          <Kpi label={tr('Per day')} value={money(t.avgRevenuePerDayMinor)} sub={<span className="text-[12px] text-ink-3">{tr('{active} of {days} days active', { active: t.activeDays, days: d.range.days })}</span>} extra={t.bestDay ? tr('best {date} · {amount}', { date: date(t.bestDay.date, 'short'), amount: money(t.bestDay.revenueMinor, { compact: true }) }) : undefined} />
        ) : (
          <Kpi label={tr('Per day')} value={money(t.avgExpensePerDayMinor)} sub={<span className="text-[12px] text-ink-3">{tr('{active} of {days} days active', { active: t.activeDays, days: d.range.days })}</span>} />
        )}
      </div>

      <Card title={tr('Trend')} subtitle={tr('By {granularity} · dotted line is the previous period ({from} – {to})', { granularity: tr(d.range.granularity), from: date(d.range.previousFrom, 'short'), to: date(d.range.previousTo) })}>
        <div className="h-[280px]"><Trend d={d} showRev={showRev} showExp={showExp} /></div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {showRev && <Card title={tr('Revenue by category')}><Breakdown items={d.revenueByCategory.map((g) => ({ id: g.id, name: g.name, nameAr: g.nameAr, color: g.color, amountMinor: g.revenueMinor, pct: g.pct, count: g.count }))} emptyLabel={tr('No revenue')} /></Card>}
        {showExp && <Card title={tr('Expenses by category')}><Breakdown items={d.expensesByCategory.map((g) => ({ id: g.id, name: g.name, nameAr: g.nameAr, color: g.color, amountMinor: g.expenseMinor, pct: g.pct, count: g.count }))} emptyLabel={tr('No expenses')} /></Card>}
        <Card title={tr('By payment method')} subtitle={showRev && showExp ? tr('Revenue and expenses combined') : undefined}><GroupList groups={d.byPaymentMethod} showRev={showRev} showExp={showExp} /></Card>
        <Card title={tr('By partner')} subtitle={tr('Received by / paid by')}><GroupList groups={d.byStakeholder} showRev={showRev} showExp={showExp} /></Card>
        <Card title={tr('Weekday pattern')} subtitle={tr('Average per day of the week')} className={clsx(showRev && showExp && 'xl:col-span-2')}>
          <div className="h-[220px]"><Weekday d={d} showRev={showRev} showExp={showExp} /></div>
        </Card>
      </div>

      {showRev && d.posSales && <PosSales s={d.posSales} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title={tr('Month by month')} flush>
          <Table>
            <thead><tr><Th>{tr('Month')}</Th>{showRev && <Th align="right">{tr('Revenue')}</Th>}{showExp && <Th align="right">{tr('Expenses')}</Th>}{showRev && showExp && <><Th align="right">{tr('Net')}</Th><Th align="right">{tr('Margin')}</Th></>}<Th align="right">{tr('Entries')}</Th></tr></thead>
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
        <Card title={showRev ? tr('Largest revenue') : tr('Largest expenses')} flush>
          <ul className="divide-y divide-line">
            {(showRev ? d.topRevenue : d.topExpenses).slice(0, 8).map((e) => (
              <li key={e.id} className="px-4 md:px-5 py-2.5 flex items-center gap-3">
                <Swatch color={e.groupColor} size={9} />
                <div className="flex-1 min-w-0"><div dir="auto" className="text-[14px] font-medium truncate">{e.description}</div><div className="text-[12px] text-ink-3">{e.groupNameAr && lang === 'ar' ? e.groupNameAr : tr(e.groupName)} · {date(e.date)}</div></div>
                <Money minor={e.amountMinor} className="font-semibold" />
              </li>
            ))}
            {!(showRev ? d.topRevenue : d.topExpenses).length && <li><EmptyState title={tr('Nothing here')} /></li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function PosSales({ s }: { s: NonNullable<InsightsResponse['posSales']> }) {
  const { t } = useI18n();
  const { money, locale } = useProject();
  const margin = s.netMinor > 0 && s.costMinor > 0 ? ((s.netMinor - s.costMinor) / s.netMinor) * 100 : null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title={t('Best sellers')} subtitle={t('From {n} Loyverse shifts in this range · {qty} items · {amount} net', { n: s.shifts, qty: qty(s.quantity, locale), amount: money(s.netMinor, { compact: true }) })} flush>
        <Table>
          <thead><tr><Th>{t('Item')}</Th><Th>{t('Category')}</Th><Th align="right">{t('Qty')}</Th><Th align="right">{t('Net sales')}</Th><Th align="right">{t('Share')}</Th></tr></thead>
          <tbody>
            {s.byItem.map((i) => (
              <Tr key={`${i.itemName}|${i.variantName ?? ''}`}>
                <Td><div dir="auto" className="font-medium truncate max-w-[320px]">{i.itemName}{i.variantName ? <span className="text-ink-3 font-normal"> · {i.variantName}</span> : null}</div></Td>
                <Td className="text-ink-2 text-[13px]">{i.categoryName ?? <span className="text-ink-4">—</span>}</Td>
                <Td align="right" className="num text-ink-2">{qty(i.quantity, locale)}</Td>
                <Td align="right"><Money minor={i.netMinor} className="font-medium" /></Td>
                <Td align="right" className="num text-ink-2">{pct(i.pct, 0)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card title={t('Sales by category')} subtitle={margin !== null ? t('gross margin {pct} after item costs', { pct: pct(margin, 0) }) : undefined}>
        <Breakdown items={s.byCategory.map((c, i) => ({ id: c.name || null, name: c.name || t('Uncategorised'), color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length], amountMinor: c.netMinor, pct: c.pct, count: Math.round(c.quantity) }))} emptyLabel={t('No sales')} />
      </Card>
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
  const { t, lang } = useI18n();
  const { money } = useProject();
  if (!groups.length) return <div className="text-[13.5px] text-ink-3 py-8 text-center">{t('Nothing in this range')}</div>;
  const total = (g: InsightsGroup) => (showRev ? g.revenueMinor : 0) + (showExp ? g.expenseMinor : 0);
  const max = Math.max(1, ...groups.map(total));
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.id ?? 'none'}>
          <div className="flex items-center justify-between text-[13.5px] mb-1.5">
            <span className="inline-flex items-center gap-2 truncate"><Swatch color={g.color} size={9} />{g.nameAr && lang === 'ar' ? g.nameAr : t(g.name)}<span className="num text-[12px] text-ink-3">{g.count}</span></span>
            <span className="num font-medium">{money(total(g))}{showRev && showExp && g.revenueMinor && g.expenseMinor ? <span className="text-ink-3 font-normal text-[12px]"> · {t('in {in} / out {out}', { in: money(g.revenueMinor, { compact: true }), out: money(g.expenseMinor, { compact: true }) })}</span> : null}</span>
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
  const { t } = useI18n();
  const { money, date, toMajor, locale } = useProject();
  const g = d.range.granularity;
  const fmtAxis = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(v));
  const fmtBucket = (b: string) => (g === 'month' ? new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${b}T00:00:00Z`)) : date(b, 'short'));
  const data = d.series.map((s) => ({ ...s, label: fmtBucket(s.bucket) }));
  const legend = [
    ...(showRev ? [{ label: t('Revenue'), color: 'var(--s-revenue)' }] : []),
    ...(showExp ? [{ label: t('Expenses'), color: 'var(--s-expense)' }] : []),
    { label: t('Previous period'), color: 'var(--ink-3)', kind: 'line' as const },
  ];
  return (
    <div className="h-full flex flex-col">
      <div className="pb-2"><Legend items={legend} /></div>
      <div className="flex-1 -ms-3">
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
                    title={g === 'day' ? date(p.bucket, 'long') : g === 'week' ? t('Week of {date}', { date: date(p.bucket) }) : fmtBucket(p.bucket)}
                    rows={[
                      ...(showRev ? [{ label: t('Revenue'), value: `${money(p.revenueMinor)} · ${p.revenueCount}`, color: 'var(--s-revenue)' }, { label: t('Prev. revenue'), value: money(p.prevRevenueMinor) }] : []),
                      ...(showExp ? [{ label: t('Expenses'), value: `${money(p.expenseMinor)} · ${p.expenseCount}`, color: 'var(--s-expense)' }, { label: t('Prev. expenses'), value: money(p.prevExpenseMinor) }] : []),
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
  const { t, lang } = useI18n();
  const { money, toMajor, locale } = useProject();
  const fmtAxis = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(v));
  const data = d.byWeekday.map((w) => ({ ...w, full: t(w.label), label: lang === 'ar' ? t(w.label) : t(w.label).slice(0, 3) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -8 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'var(--card-hover)', opacity: 0.8 }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const p = payload[0]!.payload as (typeof data)[number]; return <ChartTooltip title={t('{day} · {n} days', { day: p.full, n: p.days })} rows={[...(showRev ? [{ label: t('Avg revenue'), value: money(p.avgRevenueMinor), color: 'var(--s-revenue)' }] : []), ...(showExp ? [{ label: t('Avg expenses'), value: money(p.avgExpenseMinor), color: 'var(--s-expense)' }] : [])]} />; }} />
        {showRev && <Bar dataKey="avgRevenueMinor" fill="var(--s-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
        {showExp && <Bar dataKey="avgExpenseMinor" fill="var(--s-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
      </BarChart>
    </ResponsiveContainer>
  );
}
