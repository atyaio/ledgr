import { Injectable } from '@nestjs/common';
import type { CreateRevenueInput, ListQuery, Revenue, RevenueListResponse, UpdateRevenueInput } from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { dateRangeWhere, toIso, type Db } from '../../common/db';
import { notFound } from '../../common/errors';
import { parseCustomFields } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CategoriesService, categoryRef } from '../categories/categories.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { StakeholdersService, stakeholderRef } from '../stakeholders/stakeholders.service';
import { PaymentMethodsService, paymentMethodRef } from '../payment-methods/payment-methods.service';

const REVENUE_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  paymentMethod: { select: { id: true, name: true, color: true } },
  receivedBy: { select: { id: true, name: true, color: true } },
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
    paymentMethodId: r.paymentMethodId,
    paymentMethod: r.paymentMethod ? paymentMethodRef(r.paymentMethod) : null,
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
    if (q.paymentMethodId) and.push({ paymentMethodId: q.paymentMethodId });
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

  private async validateRefs(input: { categoryId?: string | null; receivedByStakeholderId?: string | null; paymentMethodId?: string | null }, db: Db): Promise<void> {
    if (input.categoryId) await this.categories.requireKind(input.categoryId, 'revenue', db);
    if (input.receivedByStakeholderId) await this.stakeholders.get(input.receivedByStakeholderId, db);
    if (input.paymentMethodId) await this.paymentMethods.get(input.paymentMethodId, db);
  }

  async create(input: CreateRevenueInput, actor: CurrentUser, opts: RevenueCreateOpts = {}): Promise<Revenue> {
    const db = opts.db ?? this.prisma;
    await this.validateRefs(input, db);
    const customFields = await this.customFields.normalize('revenue', input.customFields, db);
    const row = await db.revenue.create({
      data: {
        date: input.date,
        amountMinor: input.amountMinor,
        description: input.description,
        categoryId: input.categoryId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
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
    const row = await this.prisma.revenue.update({
      where: { id },
      data: {
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.paymentMethodId !== undefined ? { paymentMethodId: input.paymentMethodId } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.receivedByStakeholderId !== undefined ? { receivedByStakeholderId: input.receivedByStakeholderId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(customFields !== undefined ? { customFields: JSON.stringify(customFields) } : {}),
      },
      include: REVENUE_INCLUDE,
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
