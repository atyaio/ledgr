import { Injectable } from '@nestjs/common';
import type { CreateRevenueInput, ListQuery, Revenue, RevenueListResponse, RevenuePayment, UpdateRevenueInput } from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { dateRangeWhere, toIso, type Db } from '../../common/db';
import { badRequest, notFound } from '../../common/errors';
import { parseCustomFields } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CategoriesService, categoryRef } from '../categories/categories.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { StakeholdersService, stakeholderRef } from '../stakeholders/stakeholders.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';

const REVENUE_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  receivedBy: { select: { id: true, name: true, color: true } },
  payments: { include: { paymentMethod: { select: { name: true, color: true, sortOrder: true } } } },
} satisfies Prisma.RevenueInclude;

type RevenueRow = Prisma.RevenueGetPayload<{ include: typeof REVENUE_INCLUDE }>;

export function toRevenueDto(r: RevenueRow): Revenue {
  return {
    id: r.id,
    date: r.date,
    amountMinor: r.amountMinor,
    description: r.description,
    categoryId: r.categoryId,
    category: r.category ? categoryRef(r.category) : null,
    source: r.source,
    payments: [...r.payments]
      .sort((a, b) => a.paymentMethod.sortOrder - b.paymentMethod.sortOrder || a.paymentMethod.name.localeCompare(b.paymentMethod.name))
      .map<RevenuePayment>((p) => ({ paymentMethodId: p.paymentMethodId, name: p.paymentMethod.name, color: p.paymentMethod.color, amountMinor: p.amountMinor })),
    receivedByStakeholderId: r.receivedByStakeholderId,
    receivedBy: r.receivedBy ? stakeholderRef(r.receivedBy) : null,
    notes: r.notes,
    recurringRuleId: r.recurringRuleId,
    customFields: parseCustomFields(r.customFields),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export interface RevenueCreateOpts {
  db?: Db;
  audit?: boolean;
  recurringRuleId?: string | null;
  importBatchId?: string | null;
}

const SORTABLE = new Set(['date', 'amountMinor', 'description', 'createdAt']);

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: CategoriesService,
    private readonly stakeholders: StakeholdersService,
    private readonly customFields: CustomFieldsService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  buildWhere(q: ListQuery): Prisma.RevenueWhereInput {
    const date = dateRangeWhere(q.from, q.to);
    const and: Prisma.RevenueWhereInput[] = [];
    if (date) and.push({ date });
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.stakeholderId) and.push({ receivedByStakeholderId: q.stakeholderId });
    if (q.paymentMethodId) and.push({ payments: { some: { paymentMethodId: q.paymentMethodId, amountMinor: { gt: 0 } } } });
    if (q.q) and.push({ OR: [{ description: { contains: q.q } }, { source: { contains: q.q } }, { notes: { contains: q.q } }] });
    return and.length ? { AND: and } : {};
  }

  async list(q: ListQuery): Promise<RevenueListResponse> {
    const where = this.buildWhere(q);
    const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'date';
    const order = q.order ?? 'desc';
    const orderBy: Prisma.RevenueOrderByWithRelationInput[] = [{ [sort]: order }, ...(sort === 'createdAt' ? [] : [{ createdAt: 'desc' as const }])];
    const [rows, agg] = await Promise.all([
      this.prisma.revenue.findMany({ where, include: REVENUE_INCLUDE, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.revenue.aggregate({ where, _sum: { amountMinor: true }, _count: { _all: true } }),
    ]);
    return {
      items: rows.map(toRevenueDto),
      total: agg._count._all,
      page: q.page,
      pageSize: q.pageSize,
      totals: { amountMinor: agg._sum.amountMinor ?? 0, count: agg._count._all },
    };
  }

  async get(id: string, db: Db = this.prisma): Promise<Revenue> {
    const row = await db.revenue.findUnique({ where: { id }, include: REVENUE_INCLUDE });
    if (!row) throw notFound('Revenue', id);
    return toRevenueDto(row);
  }

  private async validateRefs(input: { categoryId?: string | null; receivedByStakeholderId?: string | null }, db: Db): Promise<void> {
    if (input.categoryId) await this.categories.requireKind(input.categoryId, 'revenue', db);
    if (input.receivedByStakeholderId) await this.stakeholders.get(input.receivedByStakeholderId, db);
  }

  /**
   * Resolve the per-method amounts for a new entry. Explicit `payments` win (total = their
   * sum); a bare amount goes to the default payment method when one exists, else it stays
   * unattributed.
   */
  private async resolvePayments(input: { amountMinor?: number; payments?: { paymentMethodId: string; amountMinor: number }[] }, db: Db): Promise<{ total: number; payments: { paymentMethodId: string; amountMinor: number }[] }> {
    const given = (input.payments ?? []).filter((p) => p.amountMinor > 0);
    if (given.length) {
      const seen = new Set<string>();
      for (const p of given) {
        if (seen.has(p.paymentMethodId)) throw badRequest('DUPLICATE_PAYMENT_METHOD', 'Each payment method can appear once');
        seen.add(p.paymentMethodId);
        await this.paymentMethods.get(p.paymentMethodId, db);
      }
      return { total: given.reduce((a, p) => a + p.amountMinor, 0), payments: given };
    }
    const total = input.amountMinor ?? 0;
    if (total <= 0) throw badRequest('AMOUNT_REQUIRED', 'Enter an amount, or at least one payment method amount');
    const def = await db.paymentMethod.findFirst({ where: { isDefault: true, archived: false } });
    return { total, payments: def ? [{ paymentMethodId: def.id, amountMinor: total }] : [] };
  }

  async create(input: CreateRevenueInput, actor: CurrentUser, opts: RevenueCreateOpts = {}): Promise<Revenue> {
    const db = opts.db ?? this.prisma;
    await this.validateRefs(input, db);
    const customFields = await this.customFields.normalize('revenue', input.customFields, db);
    const { total, payments } = await this.resolvePayments(input, db);
    const row = await db.revenue.create({
      data: {
        date: input.date,
        amountMinor: total,
        description: input.description,
        categoryId: input.categoryId ?? null,
        payments: { create: payments },
        source: input.source ?? null,
        receivedByStakeholderId: input.receivedByStakeholderId ?? null,
        notes: input.notes ?? null,
        recurringRuleId: opts.recurringRuleId ?? null,
        importBatchId: opts.importBatchId ?? null,
        customFields: JSON.stringify(customFields),
      },
      include: REVENUE_INCLUDE,
    });
    const dto = toRevenueDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'create', entity: 'revenue', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateRevenueInput, actor: CurrentUser): Promise<Revenue> {
    const before = await this.get(id);
    await this.validateRefs(input, this.prisma);
    const customFields =
      input.customFields !== undefined ? await this.customFields.normalize('revenue', { ...before.customFields, ...input.customFields }) : undefined;
    // Amount / payments: explicit payments replace everything; a bare amount change is only
    // unambiguous when the row has at most one payment method.
    let total: number | undefined;
    let replace: { paymentMethodId: string; amountMinor: number }[] | undefined;
    if (input.payments !== undefined) {
      const r = await this.resolvePayments({ payments: input.payments, amountMinor: input.amountMinor ?? before.amountMinor }, this.prisma);
      total = r.total;
      replace = r.payments;
    } else if (input.amountMinor !== undefined && input.amountMinor !== before.amountMinor) {
      if (before.payments.length > 1) throw badRequest('AMOUNT_WITH_SPLITS', 'This entry is split across payment methods. Edit the amount per method instead.');
      total = input.amountMinor;
      replace = before.payments.length === 1 ? [{ paymentMethodId: before.payments[0].paymentMethodId, amountMinor: input.amountMinor }] : undefined;
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.revenuePayment.deleteMany({ where: { revenueId: id } });
        if (replace.length) await tx.revenuePayment.createMany({ data: replace.map((p) => ({ revenueId: id, ...p })) });
      }
      return tx.revenue.update({
        where: { id },
        data: {
          ...(input.date !== undefined ? { date: input.date } : {}),
          ...(total !== undefined ? { amountMinor: total } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.receivedByStakeholderId !== undefined ? { receivedByStakeholderId: input.receivedByStakeholderId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(customFields !== undefined ? { customFields: JSON.stringify(customFields) } : {}),
        },
        include: REVENUE_INCLUDE,
      });
    });
    const after = toRevenueDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'revenue', entityId: id, before, after });
    return after;
  }

  /** Set (or clear with 0) the amount received through one payment method; the total follows. */
  async setPayment(id: string, paymentMethodId: string, amountMinor: number, actor: CurrentUser): Promise<Revenue> {
    const before = await this.get(id);
    await this.paymentMethods.get(paymentMethodId);
    const others = before.payments.filter((p) => p.paymentMethodId !== paymentMethodId);
    const next = amountMinor > 0 ? [...others, { paymentMethodId, amountMinor }] : others;
    const total = next.length ? next.reduce((a, p) => a + p.amountMinor, 0) : before.amountMinor;
    if (total <= 0) throw badRequest('AMOUNT_REQUIRED', 'A revenue entry needs at least one amount');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.revenuePayment.deleteMany({ where: { revenueId: id } });
      if (next.length) await tx.revenuePayment.createMany({ data: next.map((p) => ({ revenueId: id, paymentMethodId: p.paymentMethodId, amountMinor: p.amountMinor })) });
      return tx.revenue.update({ where: { id }, data: { amountMinor: total }, include: REVENUE_INCLUDE });
    });
    const after = toRevenueDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'revenue', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    await this.prisma.revenue.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'revenue', entityId: id, before });
  }

  async bulkDelete(ids: string[], actor: CurrentUser): Promise<{ deleted: number }> {
    const rows = await this.prisma.revenue.findMany({ where: { id: { in: ids } }, include: REVENUE_INCLUDE });
    if (rows.length === 0) return { deleted: 0 };
    const { count } = await this.prisma.revenue.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await this.audit.log({ actor, action: 'delete', entity: 'revenue', entityId: null, before: { ids: rows.map((r) => r.id), items: rows.map(toRevenueDto) }, after: { deleted: count } });
    return { deleted: count };
  }
}
