import { Injectable } from '@nestjs/common';
import {
  splitAmount,
  validCustomSplit,
  type CreateExpenseInput,
  type Expense,
  type ExpenseListResponse,
  type ListQuery,
  type RangeQuery,
  type ShareInput,
  type SplitMode,
  type SplitResult,
  type UpdateExpenseInput,
} from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { dateRangeWhere, INTERACTIVE_TX, toIso, type Db } from '../../common/db';
import { badRequest, notFound } from '../../common/errors';
import { parseCustomFields } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CategoriesService, categoryRef } from '../categories/categories.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { StakeholdersService, stakeholderRef } from '../stakeholders/stakeholders.service';

const EXPENSE_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  paidBy: { select: { id: true, name: true, color: true } },
  splits: { include: { stakeholder: { select: { name: true } } }, orderBy: { amountMinor: 'desc' } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

export function toExpenseDto(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    amountMinor: r.amountMinor,
    description: r.description,
    categoryId: r.categoryId,
    category: categoryRef(r.category),
    paidByStakeholderId: r.paidByStakeholderId,
    paidBy: r.paidBy ? stakeholderRef(r.paidBy) : null,
    vendor: r.vendor,
    notes: r.notes,
    splitMode: r.splitMode as SplitMode,
    splits: r.splits.map((s) => ({
      id: s.id,
      expenseId: s.expenseId,
      stakeholderId: s.stakeholderId,
      stakeholderName: s.stakeholder.name,
      sharePercent: s.sharePercent,
      amountMinor: s.amountMinor,
    })),
    recurringRuleId: r.recurringRuleId,
    customFields: parseCustomFields(r.customFields),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export interface ExpenseCreateOpts {
  db?: Db;
  audit?: boolean;
  recurringRuleId?: string | null;
  importBatchId?: string | null;
}

const SORTABLE = new Set(['date', 'amountMinor', 'description', 'createdAt']);
const toShares = (rows: { id: string; sharePercent: number }[]): ShareInput[] => rows.map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent }));

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: CategoriesService,
    private readonly stakeholders: StakeholdersService,
    private readonly customFields: CustomFieldsService,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  buildWhere(q: ListQuery): Prisma.ExpenseWhereInput {
    const date = dateRangeWhere(q.from, q.to);
    const and: Prisma.ExpenseWhereInput[] = [];
    if (date) and.push({ date });
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.stakeholderId) and.push({ OR: [{ paidByStakeholderId: q.stakeholderId }, { splits: { some: { stakeholderId: q.stakeholderId } } }] });
    if (q.q) and.push({ OR: [{ description: { contains: q.q } }, { vendor: { contains: q.q } }, { notes: { contains: q.q } }] });
    return and.length ? { AND: and } : {};
  }

  async list(q: ListQuery): Promise<ExpenseListResponse> {
    const where = this.buildWhere(q);
    const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'date';
    const order = q.order ?? 'desc';
    const orderBy: Prisma.ExpenseOrderByWithRelationInput[] = [{ [sort]: order }, ...(sort === 'createdAt' ? [] : [{ createdAt: 'desc' as const }])];
    const [rows, agg] = await Promise.all([
      this.prisma.expense.findMany({ where, include: EXPENSE_INCLUDE, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.expense.aggregate({ where, _sum: { amountMinor: true }, _count: { _all: true } }),
    ]);
    return {
      items: rows.map(toExpenseDto),
      total: agg._count._all,
      page: q.page,
      pageSize: q.pageSize,
      totals: { amountMinor: agg._sum.amountMinor ?? 0, count: agg._count._all },
    };
  }

  async get(id: string, db: Db = this.prisma): Promise<Expense> {
    const row = await db.expense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
    if (!row) throw notFound('Expense', id);
    return toExpenseDto(row);
  }

  // ─── Splits ─────────────────────────────────────────────────────────────────

  /** Snapshot the split for an amount under a mode (SPEC §3). */
  async computeSplits(
    amountMinor: number,
    splitMode: SplitMode,
    customSplits: { stakeholderId: string; sharePercent: number }[] | undefined,
    db: Db = this.prisma,
  ): Promise<SplitResult[]> {
    if (splitMode === 'ownership') {
      const active = await this.stakeholders.activeShares(db);
      return splitAmount(amountMinor, toShares(active));
    }
    if (!customSplits || !validCustomSplit(customSplits)) {
      throw badRequest('INVALID_SPLIT', 'Custom splits must list each stakeholder once and total 100%', customSplits ?? []);
    }
    const ids = customSplits.map((s) => s.stakeholderId);
    const found = await db.stakeholder.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const known = new Set(found.map((s) => s.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) throw badRequest('INVALID_SPLIT', 'Custom split references unknown stakeholders', unknown);
    return splitAmount(amountMinor, customSplits);
  }

  private async validateRefs(input: { categoryId: string; paidByStakeholderId?: string | null }, db: Db): Promise<void> {
    await this.categories.requireKind(input.categoryId, 'expense', db);
    if (input.paidByStakeholderId) await this.stakeholders.get(input.paidByStakeholderId, db);
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  async create(input: CreateExpenseInput, actor: CurrentUser, opts: ExpenseCreateOpts = {}): Promise<Expense> {
    const db = opts.db ?? this.prisma;
    await this.validateRefs(input, db);
    const customFields = await this.customFields.normalize('expense', input.customFields, db);
    const splits = await this.computeSplits(input.amountMinor, input.splitMode, input.customSplits, db);
    const row = await db.expense.create({
      data: {
        date: input.date,
        amountMinor: input.amountMinor,
        description: input.description,
        categoryId: input.categoryId,
        paidByStakeholderId: input.paidByStakeholderId ?? null,
        vendor: input.vendor ?? null,
        notes: input.notes ?? null,
        splitMode: input.splitMode,
        recurringRuleId: opts.recurringRuleId ?? null,
        importBatchId: opts.importBatchId ?? null,
        customFields: JSON.stringify(customFields),
        splits: { create: splits.map((s) => ({ stakeholderId: s.stakeholderId, sharePercent: s.sharePercent, amountMinor: s.amountMinor })) },
      },
      include: EXPENSE_INCLUDE,
    });
    const dto = toExpenseDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'create', entity: 'expense', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateExpenseInput, actor: CurrentUser): Promise<Expense> {
    const before = await this.get(id);
    const next = {
      categoryId: input.categoryId ?? before.categoryId,
      paidByStakeholderId: input.paidByStakeholderId === undefined ? before.paidByStakeholderId : input.paidByStakeholderId,
      amountMinor: input.amountMinor ?? before.amountMinor,
      splitMode: input.splitMode ?? before.splitMode,
    };
    await this.validateRefs(next, this.prisma);
    const customFields =
      input.customFields !== undefined ? await this.customFields.normalize('expense', { ...before.customFields, ...input.customFields }) : undefined;

    const resnapshot = input.amountMinor !== undefined || input.splitMode !== undefined || input.customSplits !== undefined;
    let splits: SplitResult[] | null = null;
    if (resnapshot) {
      const custom = input.customSplits ?? (next.splitMode === 'custom' ? before.splits.map((s) => ({ stakeholderId: s.stakeholderId, sharePercent: s.sharePercent })) : undefined);
      splits = await this.computeSplits(next.amountMinor, next.splitMode, custom);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (splits) await tx.expenseSplit.deleteMany({ where: { expenseId: id } });
      return tx.expense.update({
        where: { id },
        data: {
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.paidByStakeholderId !== undefined ? { paidByStakeholderId: input.paidByStakeholderId } : {}),
          ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.splitMode !== undefined ? { splitMode: input.splitMode } : {}),
          ...(customFields !== undefined ? { customFields: JSON.stringify(customFields) } : {}),
          ...(splits ? { splits: { create: splits.map((s) => ({ stakeholderId: s.stakeholderId, sharePercent: s.sharePercent, amountMinor: s.amountMinor })) } } : {}),
        },
        include: EXPENSE_INCLUDE,
      });
    }, INTERACTIVE_TX);
    const after = toExpenseDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'expense', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'expense', entityId: id, before });
  }

  async bulkDelete(ids: string[], actor: CurrentUser): Promise<{ deleted: number }> {
    const rows = await this.prisma.expense.findMany({ where: { id: { in: ids } }, include: EXPENSE_INCLUDE });
    if (rows.length === 0) return { deleted: 0 };
    const { count } = await this.prisma.expense.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await this.audit.log({ actor, action: 'delete', entity: 'expense', entityId: null, before: { ids: rows.map((r) => r.id), items: rows.map(toExpenseDto) }, after: { deleted: count } });
    return { deleted: count };
  }

  /** Re-snapshot one expense: ownership → from current shares; custom → re-apply its stored percentages. */
  async recomputeSplit(id: string, actor: CurrentUser): Promise<Expense> {
    const before = await this.get(id);
    const custom = before.splitMode === 'custom' ? before.splits.map((s) => ({ stakeholderId: s.stakeholderId, sharePercent: s.sharePercent })) : undefined;
    const splits = await this.computeSplits(before.amountMinor, before.splitMode, custom);
    await this.replaceSplits(id, splits);
    const after = await this.get(id);
    await this.audit.log({ actor, action: 'recompute', entity: 'expense', entityId: id, before: before.splits, after: after.splits });
    return after;
  }

  /** Re-snapshot every ownership-mode expense in a range from current shares. */
  async recomputeSplits(range: RangeQuery, actor: CurrentUser): Promise<{ updated: number; ids: string[] }> {
    const date = dateRangeWhere(range.from, range.to);
    const rows = await this.prisma.expense.findMany({ where: { splitMode: 'ownership', ...(date ? { date } : {}) }, select: { id: true, amountMinor: true } });
    const active = await this.stakeholders.activeShares();
    const shares = toShares(active);
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const splits = splitAmount(r.amountMinor, shares);
        await tx.expenseSplit.deleteMany({ where: { expenseId: r.id } });
        if (splits.length) {
          await tx.expenseSplit.createMany({
            data: splits.map((s) => ({ expenseId: r.id, stakeholderId: s.stakeholderId, sharePercent: s.sharePercent, amountMinor: s.amountMinor })),
          });
        }
      }
    }, INTERACTIVE_TX);
    const ids = rows.map((r) => r.id);
    await this.audit.log({
      actor,
      action: 'recompute',
      entity: 'expense',
      entityId: null,
      after: { range, updated: ids.length, ids, shares: active.map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent })) },
    });
    return { updated: ids.length, ids };
  }

  private async replaceSplits(expenseId: string, splits: SplitResult[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId } });
      if (splits.length) {
        await tx.expenseSplit.createMany({
          data: splits.map((s) => ({ expenseId, stakeholderId: s.stakeholderId, sharePercent: s.sharePercent, amountMinor: s.amountMinor })),
        });
      }
    }, INTERACTIVE_TX);
  }
}
