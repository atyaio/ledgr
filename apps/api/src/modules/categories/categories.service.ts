import { Injectable } from '@nestjs/common';
import {
  endOfMonth,
  pickColor,
  todayISO,
  type BudgetStatus,
  type Category,
  type CategoryKind,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Db } from '../../common/db';
import { toIso } from '../../common/db';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { pct } from '../../common/query';
import type { Category as Row } from '../../generated/prisma/client';

export function toCategoryDto(r: Row): Category {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as CategoryKind,
    color: r.color,
    monthlyBudgetMinor: r.monthlyBudgetMinor,
    isDefault: r.isDefault,
    archived: r.archived,
    sortOrder: r.sortOrder,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export const categoryRef = (r: Pick<Row, 'id' | 'name' | 'color'>): Pick<Category, 'id' | 'name' | 'color'> => ({ id: r.id, name: r.name, color: r.color });

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: { kind?: CategoryKind; includeArchived?: boolean }): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { ...(q.kind ? { kind: q.kind } : {}), ...(q.includeArchived ? {} : { archived: false }) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCategoryDto);
  }

  async get(id: string, db: Db = this.prisma): Promise<Category> {
    const row = await db.category.findUnique({ where: { id } });
    if (!row) throw notFound('Category', id);
    return toCategoryDto(row);
  }

  /** Ensure a category exists and has the expected kind (used by expenses/revenue/recurring). */
  async requireKind(id: string, kind: CategoryKind, db: Db = this.prisma): Promise<Category> {
    const cat = await this.get(id, db);
    if (cat.kind !== kind) throw badRequest('CATEGORY_KIND', `Category "${cat.name}" is a ${cat.kind} category, expected ${kind}`);
    return cat;
  }

  async findByName(kind: CategoryKind, name: string, db: Db = this.prisma): Promise<Category | null> {
    const rows = await db.category.findMany({ where: { kind } });
    const n = name.trim().toLowerCase();
    const hit = rows.find((r) => r.name.toLowerCase() === n);
    return hit ? toCategoryDto(hit) : null;
  }

  async create(input: CreateCategoryInput, actor: CurrentUser, opts: { db?: Db; audit?: boolean } = {}): Promise<Category> {
    const db = opts.db ?? this.prisma;
    const existing = await this.findByName(input.kind, input.name, db);
    if (existing) throw conflict('DUPLICATE', `A ${input.kind} category named "${existing.name}" already exists`);
    if (input.kind === 'revenue' && input.monthlyBudgetMinor) throw badRequest('BUDGET_EXPENSE_ONLY', 'Budgets apply to expense categories only');
    const count = await db.category.count({ where: { kind: input.kind } });
    if (input.isDefault) await db.category.updateMany({ where: { kind: input.kind, isDefault: true }, data: { isDefault: false } });
    const row = await db.category.create({
      data: {
        name: input.name,
        kind: input.kind,
        color: input.color ?? pickColor(count),
        monthlyBudgetMinor: input.monthlyBudgetMinor ?? null,
        isDefault: input.isDefault ?? false,
        archived: input.archived ?? false,
        sortOrder: input.sortOrder ?? count,
      },
    });
    const dto = toCategoryDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'create', entity: 'category', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateCategoryInput, actor: CurrentUser): Promise<Category> {
    const before = await this.get(id);
    if (input.name !== undefined && input.name.toLowerCase() !== before.name.toLowerCase()) {
      const dup = await this.findByName(before.kind, input.name);
      if (dup) throw conflict('DUPLICATE', `A ${before.kind} category named "${dup.name}" already exists`);
    }
    if (before.kind === 'revenue' && input.monthlyBudgetMinor) throw badRequest('BUDGET_EXPENSE_ONLY', 'Budgets apply to expense categories only');
    // Only one default per kind; archiving the default clears it.
    if (input.isDefault) await this.prisma.category.updateMany({ where: { kind: before.kind, isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const clearDefault = input.archived === true;
    const row = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.monthlyBudgetMinor !== undefined ? { monthlyBudgetMinor: input.monthlyBudgetMinor } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(clearDefault ? { isDefault: false } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    const after = toCategoryDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'category', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    const [expenses, revenue, recurring] = await Promise.all([
      this.prisma.expense.count({ where: { categoryId: id } }),
      this.prisma.revenue.count({ where: { categoryId: id } }),
      this.prisma.recurringRule.count({ where: { template: { contains: `"categoryId":"${id}"` } } }),
    ]);
    if (expenses + revenue + recurring > 0) {
      throw conflict('HAS_RECORDS', `Category "${before.name}" is used by ${expenses + revenue} entries. Archive it instead of deleting.`, {
        expenses,
        revenue,
        recurring,
      });
    }
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'category', entityId: id, before });
  }

  /** Budget vs actual for every expense category with a budget, for a YYYY-MM month. */
  async budgets(month?: string): Promise<BudgetStatus[]> {
    const m = month ?? todayISO().slice(0, 7);
    const from = `${m}-01`;
    const to = endOfMonth(from);
    const cats = await this.prisma.category.findMany({
      where: { kind: 'expense', monthlyBudgetMinor: { not: null }, archived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (cats.length === 0) return [];
    const spent = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { categoryId: { in: cats.map((c) => c.id) }, date: { gte: from, lte: to } },
      _sum: { amountMinor: true },
    });
    const spentBy = new Map(spent.map((s) => [s.categoryId, s._sum.amountMinor ?? 0]));
    return cats.map((c) => {
      const budgetMinor = c.monthlyBudgetMinor ?? 0;
      const spentMinor = spentBy.get(c.id) ?? 0;
      return {
        categoryId: c.id,
        name: c.name,
        color: c.color,
        budgetMinor,
        spentMinor,
        pct: pct(spentMinor, budgetMinor),
        remainingMinor: budgetMinor - spentMinor,
      };
    });
  }
}
