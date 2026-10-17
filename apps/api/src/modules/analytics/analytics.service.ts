import { Injectable } from '@nestjs/common';
import {
  autoGranularity,
  bucketOf,
  bucketsFor,
  previousRange,
  splitAmount,
  type AnalyticsOverview,
  type AnalyticsQuery,
  type Granularity,
} from '@ledgr/shared';
import { todayISO } from '@ledgr/shared';
import { LedgrContext } from '../../common/config/ledgr-config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deltaPct, pct } from '../../common/query';
import { CategoriesService } from '../categories/categories.service';
import { BalancesService, POOL_COLOR } from '../stakeholders/balances.service';

const UNCATEGORISED = { name: 'Uncategorised', color: POOL_COLOR };

interface CategoryBucket {
  categoryId: string | null;
  name: string;
  color: string;
  amountMinor: number;
  count: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly categories: CategoriesService,
    private readonly balances: BalancesService,
  ) {}

  async overview(q: AnalyticsQuery): Promise<AnalyticsOverview> {
    const range = { from: q.from, to: q.to };
    const granularity: Granularity = q.granularity ?? autoGranularity(range);
    const prev = previousRange(range);
    const weekStartsOn = this.ctx.config.weekStartsOn;
    const where = { date: { gte: q.from, lte: q.to } };
    const prevWhere = { date: { gte: prev.from, lte: prev.to } };

    const [expenses, revenue, prevExp, prevRev, stakeholders, figures, budgets] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        select: {
          id: true,
          date: true,
          amountMinor: true,
          description: true,
          categoryId: true,
          paidByStakeholderId: true,
          category: { select: { name: true, color: true } },
        },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.revenue.findMany({
        where,
        select: { date: true, amountMinor: true, categoryId: true, receivedByStakeholderId: true, category: { select: { name: true, color: true } }, payments: { select: { paymentMethodId: true, amountMinor: true, paymentMethod: { select: { name: true, color: true } } } } },
      }),
      this.prisma.expense.aggregate({ where: prevWhere, _sum: { amountMinor: true } }),
      this.prisma.revenue.aggregate({ where: prevWhere, _sum: { amountMinor: true } }),
      this.prisma.stakeholder.findMany({ orderBy: [{ active: 'desc' }, { sharePercent: 'desc' }, { createdAt: 'asc' }] }),
      this.balances.figures(range),
      // Budgets for the month of `to`, but never a future month (a year-to-date range should show the current month).
      this.categories.budgets((q.to < todayISO() ? q.to : todayISO()).slice(0, 7)),
    ]);

    // ─── Totals ────────────────────────────────────────────────────────────────
    const expenseMinor = expenses.reduce((a, e) => a + e.amountMinor, 0);
    const revenueMinor = revenue.reduce((a, r) => a + r.amountMinor, 0);
    const netMinor = revenueMinor - expenseMinor;
    const previous = {
      revenueMinor: prevRev._sum.amountMinor ?? 0,
      expenseMinor: prevExp._sum.amountMinor ?? 0,
      netMinor: (prevRev._sum.amountMinor ?? 0) - (prevExp._sum.amountMinor ?? 0),
    };

    // ─── Series (no gaps) ──────────────────────────────────────────────────────
    const buckets = bucketsFor(range, granularity, weekStartsOn);
    const byBucket = new Map(buckets.map((b) => [b, { revenueMinor: 0, expenseMinor: 0 }]));
    const add = (date: string, key: 'revenueMinor' | 'expenseMinor', amount: number) => {
      const b = byBucket.get(bucketOf(date, granularity, weekStartsOn));
      if (b) b[key] += amount;
    };
    for (const e of expenses) add(e.date, 'expenseMinor', e.amountMinor);
    for (const r of revenue) add(r.date, 'revenueMinor', r.amountMinor);
    let cumulative = 0;
    const series = buckets.map((bucket) => {
      const b = byBucket.get(bucket) ?? { revenueMinor: 0, expenseMinor: 0 };
      const net = b.revenueMinor - b.expenseMinor;
      cumulative += net;
      return { bucket, revenueMinor: b.revenueMinor, expenseMinor: b.expenseMinor, netMinor: net, cumulativeNetMinor: cumulative };
    });

    // ─── Category breakdowns ───────────────────────────────────────────────────
    const groupByCategory = (rows: { categoryId: string | null; amountMinor: number; category: { name: string; color: string } | null }[], total: number) => {
      const map = new Map<string, CategoryBucket>();
      for (const r of rows) {
        const key = r.categoryId ?? '';
        const cur = map.get(key) ?? {
          categoryId: r.categoryId,
          name: r.category?.name ?? UNCATEGORISED.name,
          color: r.category?.color ?? UNCATEGORISED.color,
          amountMinor: 0,
          count: 0,
        };
        cur.amountMinor += r.amountMinor;
        cur.count += 1;
        map.set(key, cur);
      }
      return [...map.values()].sort((a, b) => b.amountMinor - a.amountMinor).map((c) => ({ ...c, pct: pct(c.amountMinor, total) }));
    };
    const expensesByCategory = groupByCategory(expenses, expenseMinor).map((c) => ({ ...c, categoryId: c.categoryId ?? '' }));
    const revenueByCategory = groupByCategory(revenue, revenueMinor);
    const byMethod = new Map<string, { paymentMethodId: string | null; name: string; color: string; amountMinor: number; count: number }>();
    for (const r of revenue) {
      let attributed = 0;
      for (const p of r.payments) {
        const cur = byMethod.get(p.paymentMethodId) ?? { paymentMethodId: p.paymentMethodId, name: p.paymentMethod.name, color: p.paymentMethod.color, amountMinor: 0, count: 0 };
        cur.amountMinor += p.amountMinor;
        cur.count += 1;
        attributed += p.amountMinor;
        byMethod.set(p.paymentMethodId, cur);
      }
      const rest = r.amountMinor - attributed;
      if (rest > 0) {
        const cur = byMethod.get('') ?? { paymentMethodId: null, name: 'Unspecified', color: UNCATEGORISED.color, amountMinor: 0, count: 0 };
        cur.amountMinor += rest;
        cur.count += 1;
        byMethod.set('', cur);
      }
    }
    const revenueByPaymentMethod = [...byMethod.values()].sort((a, b) => b.amountMinor - a.amountMinor).map((m) => ({ ...m, pct: pct(m.amountMinor, revenueMinor) }));

    // ─── Top expenses ──────────────────────────────────────────────────────────
    const topExpenses = [...expenses]
      .sort((a, b) => b.amountMinor - a.amountMinor || a.date.localeCompare(b.date))
      .slice(0, 8)
      .map((e) => ({ id: e.id, date: e.date, description: e.description, amountMinor: e.amountMinor, categoryName: e.category.name, categoryColor: e.category.color }));

    // ─── Stakeholders ──────────────────────────────────────────────────────────
    const active = stakeholders.filter((s) => s.active).map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent }));
    const revShare = new Map(splitAmount(revenueMinor, active).map((s) => [s.stakeholderId, s.amountMinor]));
    const profitShare = new Map(splitAmount(netMinor, active).map((s) => [s.stakeholderId, s.amountMinor]));
    const stakeholderBlock = stakeholders.map((s) => {
      const n = BalancesService.net(figures, s.id);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        sharePercent: s.sharePercent,
        owedMinor: n.owedMinor,
        paidMinor: n.paidMinor,
        netMinor: n.netMinor,
        revenueShareMinor: revShare.get(s.id) ?? 0,
        profitShareMinor: profitShare.get(s.id) ?? 0,
      };
    });

    // ─── Pool ──────────────────────────────────────────────────────────────────
    const poolRevenue = revenue.filter((r) => r.receivedByStakeholderId === null).reduce((a, r) => a + r.amountMinor, 0);
    const poolExpense = expenses.filter((e) => e.paidByStakeholderId === null).reduce((a, e) => a + e.amountMinor, 0);

    return {
      range: { from: q.from, to: q.to, granularity, previousFrom: prev.from, previousTo: prev.to },
      totals: {
        revenueMinor,
        expenseMinor,
        netMinor,
        marginPct: revenueMinor === 0 ? null : pct(netMinor, revenueMinor),
        expenseCount: expenses.length,
        revenueCount: revenue.length,
      },
      previous,
      delta: {
        revenuePct: deltaPct(revenueMinor, previous.revenueMinor),
        expensePct: deltaPct(expenseMinor, previous.expenseMinor),
        netPct: deltaPct(netMinor, previous.netMinor),
      },
      series,
      expensesByCategory,
      revenueByCategory,
      revenueByPaymentMethod,
      topExpenses,
      stakeholders: stakeholderBlock,
      budgets,
      pool: { revenueMinor: poolRevenue, expenseMinor: poolExpense, netMinor: poolRevenue - poolExpense },
    };
  }
}
