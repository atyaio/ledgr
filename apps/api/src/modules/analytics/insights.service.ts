import { Injectable } from '@nestjs/common';
import {
  autoGranularity,
  bucketOf,
  bucketsFor,
  daysBetween,
  parseISODate,
  previousRange,
  type InsightsBucket,
  type InsightsGroup,
  type InsightsQuery,
  type InsightsResponse,
} from '@ledgr/shared';
import { LedgrContext } from '../../common/config/ledgr-config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deltaPct, pct } from '../../common/query';
import type { Prisma } from '../../generated/prisma/client';
import { LoyverseService } from '../integrations/loyverse/loyverse.service';
import { POOL_COLOR } from '../stakeholders/balances.service';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NONE = { name: 'Unspecified', color: POOL_COLOR };

interface Entry {
  id: string;
  date: string;
  description: string;
  amountMinor: number; // after the payment-method filter is applied
  categoryId: string | null;
  category: { name: string; nameAr: string | null; color: string } | null;
  partyId: string | null;
  party: { name: string; nameAr: string | null; color: string } | null;
  payments: { paymentMethodId: string; amountMinor: number; paymentMethod: { name: string; nameAr: string | null; color: string } }[];
}

/**
 * Filtered analytics for the Insights page. Everything is computed in TS over the
 * rows in the range; with a payment-method filter, an entry counts only the part
 * received or paid through those methods.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly loyverse: LoyverseService,
  ) {}

  async insights(q: InsightsQuery): Promise<InsightsResponse> {
    const range = { from: q.from, to: q.to };
    const prev = previousRange(range);
    const granularity = q.granularity ?? autoGranularity(range);
    const weekStartsOn = this.ctx.config.weekStartsOn;
    const methods = new Set(q.paymentMethodIds ?? []);
    const cats = q.categoryIds ?? [];

    const [revenue, expenses, prevRevenue, prevExpenses] = await Promise.all([
      q.ledger === 'expenses' ? [] : this.loadRevenue(range, cats, methods, q.stakeholderId),
      q.ledger === 'revenue' ? [] : this.loadExpenses(range, cats, methods, q.stakeholderId),
      q.ledger === 'expenses' ? [] : this.loadRevenue(prev, cats, methods, q.stakeholderId),
      q.ledger === 'revenue' ? [] : this.loadExpenses(prev, cats, methods, q.stakeholderId),
    ]);

    const sum = (rows: Entry[]) => rows.reduce((a, r) => a + r.amountMinor, 0);
    const revenueMinor = sum(revenue);
    const expenseMinor = sum(expenses);
    const prevRev = sum(prevRevenue);
    const prevExp = sum(prevExpenses);
    const days = daysBetween(range.from, range.to) + 1;

    // ─── Series with previous-period overlay (aligned by bucket index) ─────────
    const buckets = bucketsFor(range, granularity, weekStartsOn);
    const prevBuckets = bucketsFor(prev, granularity, weekStartsOn);
    const idx = new Map(buckets.map((b, i) => [b, i]));
    const prevIdx = new Map(prevBuckets.map((b, i) => [b, i]));
    const series: InsightsBucket[] = buckets.map((bucket) => ({ bucket, revenueMinor: 0, expenseMinor: 0, netMinor: 0, revenueCount: 0, expenseCount: 0, prevRevenueMinor: 0, prevExpenseMinor: 0 }));
    for (const r of revenue) {
      const i = idx.get(bucketOf(r.date, granularity, weekStartsOn));
      if (i !== undefined) {
        series[i].revenueMinor += r.amountMinor;
        series[i].revenueCount += 1;
      }
    }
    for (const e of expenses) {
      const i = idx.get(bucketOf(e.date, granularity, weekStartsOn));
      if (i !== undefined) {
        series[i].expenseMinor += e.amountMinor;
        series[i].expenseCount += 1;
      }
    }
    for (const r of prevRevenue) {
      const i = prevIdx.get(bucketOf(r.date, granularity, weekStartsOn));
      if (i !== undefined && series[i]) series[i].prevRevenueMinor += r.amountMinor;
    }
    for (const e of prevExpenses) {
      const i = prevIdx.get(bucketOf(e.date, granularity, weekStartsOn));
      if (i !== undefined && series[i]) series[i].prevExpenseMinor += e.amountMinor;
    }
    for (const s of series) s.netMinor = s.revenueMinor - s.expenseMinor;

    // ─── Groups ────────────────────────────────────────────────────────────────
    const group = (rows: Entry[], key: (r: Entry) => { id: string | null; name: string; nameAr: string | null; color: string }, kind: 'revenue' | 'expense', total: number): InsightsGroup[] => {
      const map = new Map<string, InsightsGroup>();
      for (const r of rows) {
        const k = key(r);
        const cur = map.get(k.id ?? '') ?? { id: k.id, name: k.name, nameAr: k.nameAr, color: k.color, revenueMinor: 0, expenseMinor: 0, count: 0, pct: 0 };
        if (kind === 'revenue') cur.revenueMinor += r.amountMinor;
        else cur.expenseMinor += r.amountMinor;
        cur.count += 1;
        map.set(k.id ?? '', cur);
      }
      return [...map.values()]
        .map((g) => ({ ...g, pct: pct(kind === 'revenue' ? g.revenueMinor : g.expenseMinor, total) }))
        .sort((a, b) => (kind === 'revenue' ? b.revenueMinor - a.revenueMinor : b.expenseMinor - a.expenseMinor));
    };
    const byCat = (r: Entry) => ({ id: r.categoryId, name: r.category?.name ?? 'Uncategorised', nameAr: r.category?.nameAr ?? null, color: r.category?.color ?? POOL_COLOR });
    const revenueByCategory = group(revenue, byCat, 'revenue', revenueMinor);
    const expensesByCategory = group(expenses, byCat, 'expense', expenseMinor);

    // Payment methods and partners combine both ledgers into one row per group.
    const merge = (a: InsightsGroup[], b: InsightsGroup[]): InsightsGroup[] => {
      const map = new Map<string, InsightsGroup>();
      for (const g of [...a, ...b]) {
        const cur = map.get(g.id ?? '') ?? { ...g, revenueMinor: 0, expenseMinor: 0, count: 0, pct: 0 };
        cur.revenueMinor += g.revenueMinor;
        cur.expenseMinor += g.expenseMinor;
        cur.count += g.count;
        map.set(g.id ?? '', cur);
      }
      const total = revenueMinor + expenseMinor;
      return [...map.values()].map((g) => ({ ...g, pct: pct(g.revenueMinor + g.expenseMinor, total) })).sort((x, y) => y.revenueMinor + y.expenseMinor - (x.revenueMinor + x.expenseMinor));
    };
    const byMethodRows = (rows: Entry[]): Entry[] =>
      rows.flatMap((r) => {
        const parts = r.payments.filter((p) => !methods.size || methods.has(p.paymentMethodId));
        const attributed = parts.reduce((a, p) => a + p.amountMinor, 0);
        const out: Entry[] = parts.map((p) => ({ ...r, amountMinor: p.amountMinor, categoryId: p.paymentMethodId, category: p.paymentMethod }));
        if (!methods.size && r.amountMinor - attributed > 0) out.push({ ...r, amountMinor: r.amountMinor - attributed, categoryId: null, category: null });
        return out;
      });
    const byMethodKey = (r: Entry) => ({ id: r.categoryId, name: r.category?.name ?? NONE.name, nameAr: r.category?.nameAr ?? null, color: r.category?.color ?? NONE.color });
    const byPaymentMethod = merge(group(byMethodRows(revenue), byMethodKey, 'revenue', revenueMinor), group(byMethodRows(expenses), byMethodKey, 'expense', expenseMinor));
    const byPartyKey = (r: Entry) => ({ id: r.partyId, name: r.party?.name ?? 'Company account', nameAr: r.party?.nameAr ?? null, color: r.party?.color ?? POOL_COLOR });
    const byStakeholder = merge(group(revenue, byPartyKey, 'revenue', revenueMinor), group(expenses, byPartyKey, 'expense', expenseMinor));

    // ─── Weekday pattern ───────────────────────────────────────────────────────
    const dayCounts = new Array(7).fill(0) as number[];
    for (let i = 0; i < days && i < 10000; i++) dayCounts[(parseISODate(range.from).getUTCDay() + i) % 7] += 1;
    const wd = WEEKDAYS.map((label, weekday) => ({ weekday, label, days: dayCounts[weekday], revenueMinor: 0, expenseMinor: 0, avgRevenueMinor: 0, avgExpenseMinor: 0 }));
    for (const r of revenue) wd[parseISODate(r.date).getUTCDay()].revenueMinor += r.amountMinor;
    for (const e of expenses) wd[parseISODate(e.date).getUTCDay()].expenseMinor += e.amountMinor;
    for (const w of wd) {
      w.avgRevenueMinor = w.days ? Math.round(w.revenueMinor / w.days) : 0;
      w.avgExpenseMinor = w.days ? Math.round(w.expenseMinor / w.days) : 0;
    }
    const byWeekday = [...wd.slice(weekStartsOn), ...wd.slice(0, weekStartsOn)];

    // ─── Month table ───────────────────────────────────────────────────────────
    const months = new Map<string, { month: string; revenueMinor: number; expenseMinor: number; revenueCount: number; expenseCount: number }>();
    const monthOf = (d: string) => d.slice(0, 7);
    for (const b of bucketsFor(range, 'month', weekStartsOn)) months.set(monthOf(b), { month: monthOf(b), revenueMinor: 0, expenseMinor: 0, revenueCount: 0, expenseCount: 0 });
    for (const r of revenue) {
      const m = months.get(monthOf(r.date));
      if (m) {
        m.revenueMinor += r.amountMinor;
        m.revenueCount += 1;
      }
    }
    for (const e of expenses) {
      const m = months.get(monthOf(e.date));
      if (m) {
        m.expenseMinor += e.amountMinor;
        m.expenseCount += 1;
      }
    }
    const byMonth = [...months.values()].map((m) => ({ ...m, netMinor: m.revenueMinor - m.expenseMinor, marginPct: m.revenueMinor ? pct(m.revenueMinor - m.expenseMinor, m.revenueMinor) : null }));

    // ─── Totals ────────────────────────────────────────────────────────────────
    const perDay = new Map<string, number>();
    for (const r of revenue) perDay.set(r.date, (perDay.get(r.date) ?? 0) + r.amountMinor);
    const dayList = [...perDay.entries()].sort((a, b) => b[1] - a[1]);
    const activeDays = new Set([...revenue.map((r) => r.date), ...expenses.map((e) => e.date)]).size;
    const top = (rows: Entry[]) =>
      [...rows]
        .sort((a, b) => b.amountMinor - a.amountMinor || a.date.localeCompare(b.date))
        .slice(0, 8)
        .map((r) => ({ id: r.id, date: r.date, description: r.description, amountMinor: r.amountMinor, groupName: r.category?.name ?? 'Uncategorised', groupNameAr: r.category?.nameAr ?? null, groupColor: r.category?.color ?? POOL_COLOR }));

    const netMinor = revenueMinor - expenseMinor;
    return {
      range: { from: range.from, to: range.to, days, granularity, previousFrom: prev.from, previousTo: prev.to },
      filters: { ledger: q.ledger, categoryIds: cats, paymentMethodIds: [...methods], stakeholderId: q.stakeholderId ?? null },
      totals: {
        revenueMinor,
        expenseMinor,
        netMinor,
        marginPct: revenueMinor ? pct(netMinor, revenueMinor) : null,
        revenueCount: revenue.length,
        expenseCount: expenses.length,
        avgRevenuePerEntryMinor: revenue.length ? Math.round(revenueMinor / revenue.length) : 0,
        avgExpensePerEntryMinor: expenses.length ? Math.round(expenseMinor / expenses.length) : 0,
        avgRevenuePerDayMinor: Math.round(revenueMinor / days),
        avgExpensePerDayMinor: Math.round(expenseMinor / days),
        activeDays,
        bestDay: dayList.length ? { date: dayList[0][0], revenueMinor: dayList[0][1] } : null,
        quietestDay: dayList.length > 1 ? { date: dayList[dayList.length - 1][0], revenueMinor: dayList[dayList.length - 1][1] } : null,
      },
      previous: { revenueMinor: prevRev, expenseMinor: prevExp, netMinor: prevRev - prevExp, revenueCount: prevRevenue.length, expenseCount: prevExpenses.length },
      delta: { revenuePct: deltaPct(revenueMinor, prevRev), expensePct: deltaPct(expenseMinor, prevExp), netPct: deltaPct(netMinor, prevRev - prevExp) },
      series,
      revenueByCategory,
      expensesByCategory,
      byPaymentMethod,
      byStakeholder,
      byWeekday,
      byMonth,
      topRevenue: top(revenue),
      topExpenses: top(expenses),
      posSales: q.ledger === 'expenses' ? null : await this.loyverse.salesSummary(range),
    };
  }

  private applyMethods(amountMinor: number, payments: Entry['payments'], methods: Set<string>): number {
    if (!methods.size) return amountMinor;
    return payments.filter((p) => methods.has(p.paymentMethodId)).reduce((a, p) => a + p.amountMinor, 0);
  }

  private async loadRevenue(range: { from: string; to: string }, cats: string[], methods: Set<string>, stakeholderId?: string): Promise<Entry[]> {
    const where: Prisma.RevenueWhereInput = {
      date: { gte: range.from, lte: range.to },
      ...(cats.length ? { categoryId: { in: cats } } : {}),
      ...(methods.size ? { payments: { some: { paymentMethodId: { in: [...methods] }, amountMinor: { gt: 0 } } } } : {}),
      ...(stakeholderId ? { receivedByStakeholderId: stakeholderId } : {}),
    };
    const rows = await this.prisma.revenue.findMany({
      where,
      select: {
        id: true,
        date: true,
        description: true,
        amountMinor: true,
        categoryId: true,
        category: { select: { name: true, nameAr: true, color: true } },
        receivedByStakeholderId: true,
        receivedBy: { select: { name: true, nameAr: true, color: true } },
        payments: { select: { paymentMethodId: true, amountMinor: true, paymentMethod: { select: { name: true, nameAr: true, color: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amountMinor: this.applyMethods(r.amountMinor, r.payments, methods),
      categoryId: r.categoryId,
      category: r.category,
      partyId: r.receivedByStakeholderId,
      party: r.receivedBy,
      payments: r.payments,
    }));
  }

  private async loadExpenses(range: { from: string; to: string }, cats: string[], methods: Set<string>, stakeholderId?: string): Promise<Entry[]> {
    const where: Prisma.ExpenseWhereInput = {
      date: { gte: range.from, lte: range.to },
      ...(cats.length ? { categoryId: { in: cats } } : {}),
      ...(methods.size ? { payments: { some: { paymentMethodId: { in: [...methods] }, amountMinor: { gt: 0 } } } } : {}),
      ...(stakeholderId ? { OR: [{ paidByStakeholderId: stakeholderId }, { splits: { some: { stakeholderId } } }] } : {}),
    };
    const rows = await this.prisma.expense.findMany({
      where,
      select: {
        id: true,
        date: true,
        description: true,
        amountMinor: true,
        categoryId: true,
        category: { select: { name: true, nameAr: true, color: true } },
        paidByStakeholderId: true,
        paidBy: { select: { name: true, nameAr: true, color: true } },
        payments: { select: { paymentMethodId: true, amountMinor: true, paymentMethod: { select: { name: true, nameAr: true, color: true } } } },
      },
    });
    return rows.map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amountMinor: this.applyMethods(e.amountMinor, e.payments, methods),
      categoryId: e.categoryId,
      category: e.category,
      partyId: e.paidByStakeholderId,
      party: e.paidBy,
      payments: e.payments,
    }));
  }
}
