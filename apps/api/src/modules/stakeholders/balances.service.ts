import { Injectable } from '@nestjs/common';
import {
  POOL_ID,
  splitAmount,
  suggestTransfers,
  shareTotal as sumShares,
  type BalancesResponse,
  type DistributionResponse,
  type StakeholderBalance,
} from '@ledgr/shared';
import { dateRangeWhere } from '../../common/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export const POOL_NAME = 'Company pool';
export const POOL_COLOR = '#9A9FAD';

export interface RangeArg {
  from?: string | null;
  to?: string | null;
}

/**
 * Per-party ledger figures for a range. The pool is a party like any other:
 * paid = pool-paid expenses, owed = 0 (pool has no splits), settledIn = settlements to pool.
 * With that, Σ net over stakeholders + pool is always 0 (see SPEC §4).
 */
export interface LedgerFigures {
  owed: Map<string, number>;
  paid: Map<string, number>;
  settledOut: Map<string, number>;
  settledIn: Map<string, number>;
  totalExpenseMinor: number;
  poolPaidMinor: number;
}

@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async figures(range: RangeArg): Promise<LedgerFigures> {
    const date = dateRangeWhere(range.from, range.to);
    const where = date ? { date } : {};
    const [owedRows, paidRows, outRows, inRows, totals] = await Promise.all([
      this.prisma.expenseSplit.groupBy({ by: ['stakeholderId'], where: { expense: where }, _sum: { amountMinor: true } }),
      this.prisma.expense.groupBy({ by: ['paidByStakeholderId'], where, _sum: { amountMinor: true } }),
      this.prisma.settlement.groupBy({ by: ['fromStakeholderId'], where, _sum: { amountMinor: true } }),
      this.prisma.settlement.groupBy({ by: ['toStakeholderId'], where, _sum: { amountMinor: true } }),
      this.prisma.expense.aggregate({ where, _sum: { amountMinor: true } }),
    ]);
    const owed = new Map<string, number>();
    const paid = new Map<string, number>();
    const settledOut = new Map<string, number>();
    const settledIn = new Map<string, number>();
    for (const r of owedRows) owed.set(r.stakeholderId, r._sum.amountMinor ?? 0);
    for (const r of paidRows) paid.set(r.paidByStakeholderId ?? POOL_ID, r._sum.amountMinor ?? 0);
    for (const r of outRows) settledOut.set(r.fromStakeholderId, r._sum.amountMinor ?? 0);
    for (const r of inRows) settledIn.set(r.toStakeholderId ?? POOL_ID, r._sum.amountMinor ?? 0);
    return {
      owed,
      paid,
      settledOut,
      settledIn,
      totalExpenseMinor: totals._sum.amountMinor ?? 0,
      poolPaidMinor: paid.get(POOL_ID) ?? 0,
    };
  }

  static net(f: LedgerFigures, id: string): Omit<StakeholderBalance, 'stakeholderId' | 'name' | 'color' | 'sharePercent'> {
    const owedMinor = f.owed.get(id) ?? 0;
    const paidMinor = f.paid.get(id) ?? 0;
    const settledOutMinor = f.settledOut.get(id) ?? 0;
    const settledInMinor = f.settledIn.get(id) ?? 0;
    return { owedMinor, paidMinor, settledOutMinor, settledInMinor, netMinor: paidMinor - owedMinor + settledOutMinor - settledInMinor };
  }

  async balances(range: RangeArg): Promise<BalancesResponse> {
    const [stakeholders, f] = await Promise.all([
      this.prisma.stakeholder.findMany({ orderBy: [{ active: 'desc' }, { sharePercent: 'desc' }, { createdAt: 'asc' }] }),
      this.figures(range),
    ]);
    const balances: StakeholderBalance[] = stakeholders.map((s) => ({
      stakeholderId: s.id,
      name: s.name,
      color: s.color,
      sharePercent: s.sharePercent,
      ...BalancesService.net(f, s.id),
    }));
    balances.push({ stakeholderId: POOL_ID, name: POOL_NAME, color: POOL_COLOR, sharePercent: 0, ...BalancesService.net(f, POOL_ID) });
    const suggestions = suggestTransfers(balances.map((b) => ({ id: b.stakeholderId, name: b.name, netMinor: b.netMinor })));
    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      totalExpenseMinor: f.totalExpenseMinor,
      poolPaidMinor: f.poolPaidMinor,
      balances,
      suggestions,
    };
  }

  async distribution(range: RangeArg): Promise<DistributionResponse> {
    const date = dateRangeWhere(range.from, range.to);
    const where = date ? { date } : {};
    const [active, rev, exp] = await Promise.all([
      this.prisma.stakeholder.findMany({ where: { active: true }, orderBy: [{ sharePercent: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.revenue.aggregate({ where, _sum: { amountMinor: true } }),
      this.prisma.expense.aggregate({ where, _sum: { amountMinor: true } }),
    ]);
    const revenueMinor = rev._sum.amountMinor ?? 0;
    const expenseMinor = exp._sum.amountMinor ?? 0;
    const profitMinor = revenueMinor - expenseMinor;
    const shares = active.map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent }));
    const byId = <T extends { stakeholderId: string; amountMinor: number }>(rows: T[]) => new Map(rows.map((r) => [r.stakeholderId, r.amountMinor]));
    const revShare = byId(splitAmount(revenueMinor, shares));
    const expShare = byId(splitAmount(expenseMinor, shares));
    const profitShare = byId(splitAmount(profitMinor, shares));
    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      revenueMinor,
      expenseMinor,
      profitMinor,
      shareTotal: sumShares(active),
      items: active.map((s) => ({
        stakeholderId: s.id,
        name: s.name,
        color: s.color,
        sharePercent: s.sharePercent,
        revenueShareMinor: revShare.get(s.id) ?? 0,
        expenseShareMinor: expShare.get(s.id) ?? 0,
        profitShareMinor: profitShare.get(s.id) ?? 0,
      })),
    };
  }
}
