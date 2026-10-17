import { Injectable } from '@nestjs/common';
import { POOL_ID, type CreateSettlementInput, type ListQuery, type Paginated, type Settlement, type UpdateSettlementInput } from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { dateRangeWhere, toIso, type Db } from '../../common/db';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { StakeholdersService, stakeholderRef } from '../stakeholders/stakeholders.service';

const SETTLEMENT_INCLUDE = {
  from: { select: { id: true, name: true, color: true } },
  to: { select: { id: true, name: true, color: true } },
} satisfies Prisma.SettlementInclude;

type SettlementRow = Prisma.SettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;

export function toSettlementDto(r: SettlementRow): Settlement {
  return {
    id: r.id,
    date: r.date,
    fromStakeholderId: r.fromStakeholderId,
    from: stakeholderRef(r.from),
    toStakeholderId: r.toStakeholderId,
    to: r.to ? stakeholderRef(r.to) : null,
    amountMinor: r.amountMinor,
    note: r.note,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export interface SettlementCreateOpts {
  db?: Db;
  audit?: boolean;
}

const SORTABLE = new Set(['date', 'amountMinor', 'createdAt']);

/** Accept "pool" as an alias for null in toStakeholderId. */
const normalizeTo = (id: string | null | undefined): string | null => (id === undefined || id === null || id === POOL_ID ? null : id);

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stakeholders: StakeholdersService,
  ) {}

  async list(q: ListQuery): Promise<Paginated<Settlement>> {
    const date = dateRangeWhere(q.from, q.to);
    const and: Prisma.SettlementWhereInput[] = [];
    if (date) and.push({ date });
    if (q.stakeholderId) and.push({ OR: [{ fromStakeholderId: q.stakeholderId }, { toStakeholderId: q.stakeholderId }] });
    if (q.q) and.push({ note: { contains: q.q } });
    const where: Prisma.SettlementWhereInput = and.length ? { AND: and } : {};
    const sort = q.sort && SORTABLE.has(q.sort) ? q.sort : 'date';
    const order = q.order ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        include: SETTLEMENT_INCLUDE,
        orderBy: [{ [sort]: order }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);
    return { items: rows.map(toSettlementDto), total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string, db: Db = this.prisma): Promise<Settlement> {
    const row = await db.settlement.findUnique({ where: { id }, include: SETTLEMENT_INCLUDE });
    if (!row) throw notFound('Settlement', id);
    return toSettlementDto(row);
  }

  private async validateParties(from: string, to: string | null, db: Db): Promise<void> {
    if (from === to) throw badRequest('SAME_PARTY', 'A settlement needs two different parties');
    await this.stakeholders.get(from, db);
    if (to) await this.stakeholders.get(to, db);
  }

  async create(input: CreateSettlementInput, actor: CurrentUser, opts: SettlementCreateOpts = {}): Promise<Settlement> {
    const db = opts.db ?? this.prisma;
    const to = normalizeTo(input.toStakeholderId);
    await this.validateParties(input.fromStakeholderId, to, db);
    const row = await db.settlement.create({
      data: { date: input.date, fromStakeholderId: input.fromStakeholderId, toStakeholderId: to, amountMinor: input.amountMinor, note: input.note ?? null },
      include: SETTLEMENT_INCLUDE,
    });
    const dto = toSettlementDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'settle', entity: 'settlement', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateSettlementInput, actor: CurrentUser): Promise<Settlement> {
    const before = await this.get(id);
    const from = input.fromStakeholderId ?? before.fromStakeholderId;
    const to = input.toStakeholderId === undefined ? before.toStakeholderId : normalizeTo(input.toStakeholderId);
    await this.validateParties(from, to, this.prisma);
    const row = await this.prisma.settlement.update({
      where: { id },
      data: {
        ...(input.date !== undefined ? { date: input.date } : {}),
        fromStakeholderId: from,
        toStakeholderId: to,
        ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      include: SETTLEMENT_INCLUDE,
    });
    const after = toSettlementDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'settlement', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    await this.prisma.settlement.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'settlement', entityId: id, before });
  }
}
