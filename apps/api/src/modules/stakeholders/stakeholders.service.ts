import { Injectable } from '@nestjs/common';
import { pickColor, shareTotal, type CreateStakeholderInput, type Stakeholder, type UpdateStakeholderInput } from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Db } from '../../common/db';
import { toIso } from '../../common/db';
import { conflict, notFound } from '../../common/errors';
import { parseCustomFields } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Stakeholder as Row } from '../../generated/prisma/client';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';

export function toStakeholderDto(r: Row): Stakeholder {
  return {
    id: r.id,
    name: r.name,
    nameAr: r.nameAr,
    email: r.email,
    sharePercent: r.sharePercent,
    active: r.active,
    joinedAt: r.joinedAt,
    notes: r.notes,
    color: r.color,
    customFields: parseCustomFields(r.customFields),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export const stakeholderRef = (r: Pick<Row, 'id' | 'name' | 'nameAr' | 'color'>): Pick<Stakeholder, 'id' | 'name' | 'nameAr' | 'color'> => ({
  id: r.id,
  name: r.name,
  nameAr: r.nameAr,
  color: r.color,
});

export interface StakeholderListResponse {
  items: Stakeholder[];
  shareTotal: number;
}

@Injectable()
export class StakeholdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customFields: CustomFieldsService,
  ) {}

  async list(): Promise<StakeholderListResponse> {
    const rows = await this.prisma.stakeholder.findMany({ orderBy: [{ active: 'desc' }, { sharePercent: 'desc' }, { createdAt: 'asc' }] });
    const items = rows.map(toStakeholderDto);
    return { items, shareTotal: shareTotal(items) };
  }

  /** Active stakeholders with a positive share — the basis for ownership splits and distribution. */
  async activeShares(db: Db = this.prisma): Promise<Stakeholder[]> {
    const rows = await db.stakeholder.findMany({ where: { active: true }, orderBy: [{ sharePercent: 'desc' }, { createdAt: 'asc' }] });
    return rows.map(toStakeholderDto);
  }

  async get(id: string, db: Db = this.prisma): Promise<Stakeholder> {
    const row = await db.stakeholder.findUnique({ where: { id } });
    if (!row) throw notFound('Stakeholder', id);
    return toStakeholderDto(row);
  }

  async findByName(name: string, db: Db = this.prisma): Promise<Stakeholder | null> {
    const rows = await db.stakeholder.findMany();
    const n = name.trim().toLowerCase();
    const hit = rows.find((r) => r.name.toLowerCase() === n || (r.nameAr ?? '').trim().toLowerCase() === n);
    return hit ? toStakeholderDto(hit) : null;
  }

  async create(input: CreateStakeholderInput, actor: CurrentUser, opts: { db?: Db; audit?: boolean } = {}): Promise<Stakeholder> {
    const db = opts.db ?? this.prisma;
    const customFields = await this.customFields.normalize('stakeholder', input.customFields, db);
    const count = await db.stakeholder.count();
    const row = await db.stakeholder.create({
      data: {
        name: input.name,
        nameAr: input.nameAr ?? null,
        email: input.email ?? null,
        sharePercent: input.sharePercent,
        active: input.active ?? true,
        joinedAt: input.joinedAt ?? null,
        notes: input.notes ?? null,
        color: input.color ?? pickColor(count),
        customFields: JSON.stringify(customFields),
      },
    });
    const dto = toStakeholderDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'create', entity: 'stakeholder', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateStakeholderInput, actor: CurrentUser): Promise<Stakeholder> {
    const before = await this.get(id);
    const customFields =
      input.customFields !== undefined ? await this.customFields.normalize('stakeholder', { ...before.customFields, ...input.customFields }) : undefined;
    const row = await this.prisma.stakeholder.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.sharePercent !== undefined ? { sharePercent: input.sharePercent } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.joinedAt !== undefined ? { joinedAt: input.joinedAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(customFields !== undefined ? { customFields: JSON.stringify(customFields) } : {}),
      },
    });
    const after = toStakeholderDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'stakeholder', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser, force = false): Promise<void> {
    const before = await this.get(id);
    const [splits, paid, received, settlements] = await Promise.all([
      this.prisma.expenseSplit.count({ where: { stakeholderId: id } }),
      this.prisma.expense.count({ where: { paidByStakeholderId: id } }),
      this.prisma.revenue.count({ where: { receivedByStakeholderId: id } }),
      this.prisma.settlement.count({ where: { OR: [{ fromStakeholderId: id }, { toStakeholderId: id }] } }),
    ]);
    const total = splits + paid + received + settlements;
    if (total > 0 && !force) {
      throw conflict(
        'HAS_RECORDS',
        `${before.name} has ${total} linked record(s) (splits, payments, revenue or settlements). Deactivate them, or delete with ?force=true to unlink.`,
        { splits, paidExpenses: paid, receivedRevenue: received, settlements },
      );
    }
    await this.prisma.stakeholder.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'stakeholder', entityId: id, before, after: force ? { force: true, unlinked: { splits, paid, received, settlements } } : undefined });
  }
}
