import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsOverview, Granularity } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { ChartTooltip, Legend } from './tooltip';

const SERIES = [
  { key: 'revenueMinor', label: 'Revenue', color: 'var(--s-revenue)', kind: 'bar' as const },
  { key: 'expenseMinor', label: 'Expenses', color: 'var(--s-expense)', kind: 'bar' as const },
  { key: 'netMinor', label: 'Net', color: 'var(--s-net)', kind: 'line' as const },
];

export function CashflowChart({ series, granularity }: { series: AnalyticsOverview['series']; granularity: Granularity }) {
  const { money, date, toMajor, currency, locale } = useProject();
  const fmtAxis = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(v));
  const fmtBucket = (b: string) => (granularity === 'month' ? new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${b}T00:00:00Z`)) : date(b, 'short'));
  const data = series.map((s) => ({ ...s, label: fmtBucket(s.bucket) }));
  const tickEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3">
        <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color, kind: s.kind }))} />
        <span className="eyebrow">{currency} · by {granularity}</span>
      </div>
      <div className="flex-1 min-h-[220px] px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} interval={tickEvery - 1} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={46} tick={{ fill: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }} />
            <Tooltip
              cursor={{ fill: 'var(--panel-hover)', opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof data)[number];
                return (
                  <ChartTooltip
                    title={granularity === 'day' ? date(p.bucket, 'long') : granularity === 'week' ? `Week of ${date(p.bucket)}` : fmtBucket(p.bucket)}
                    rows={[
                      { label: 'Revenue', value: money(p.revenueMinor), color: 'var(--s-revenue)' },
                      { label: 'Expenses', value: money(p.expenseMinor), color: 'var(--s-expense)' },
                      { label: 'Net', value: money(p.netMinor, { signed: true }), color: 'var(--s-net)' },
                      { label: 'Cumulative', value: money(p.cumulativeNetMinor, { signed: true }) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="revenueMinor" fill="var(--s-revenue)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="expenseMinor" fill="var(--s-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Line type="monotone" dataKey="netMinor" stroke="var(--s-net)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--panel)', strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
