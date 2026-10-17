import { Injectable } from '@nestjs/common';
import { pickColor, type CreatePaymentMethodInput, type PaymentMethod, type UpdatePaymentMethodInput } from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Db } from '../../common/db';
import { toIso } from '../../common/db';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PaymentMethod as Row } from '../../generated/prisma/client';

export function toPaymentMethodDto(r: Row): PaymentMethod {
  return { id: r.id, name: r.name, color: r.color, isDefault: r.isDefault, archived: r.archived, sortOrder: r.sortOrder, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) };
}

export const paymentMethodRef = (r: Pick<Row, 'id' | 'name' | 'color'>): Pick<PaymentMethod, 'id' | 'name' | 'color'> => ({ id: r.id, name: r.name, color: r.color });

/** How revenue was received: cash, card, online… One default; archived ones stay on history. */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: { includeArchived?: boolean } = {}): Promise<PaymentMethod[]> {
    const rows = await this.prisma.paymentMethod.findMany({ where: q.includeArchived ? {} : { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(toPaymentMethodDto);
  }

  async get(id: string, db: Db = this.prisma): Promise<PaymentMethod> {
    const row = await db.paymentMethod.findUnique({ where: { id } });
    if (!row) throw notFound('Payment method', id);
    return toPaymentMethodDto(row);
  }

  async findByName(name: string, db: Db = this.prisma): Promise<PaymentMethod | null> {
    const rows = await db.paymentMethod.findMany();
    const hit = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    return hit ? toPaymentMethodDto(hit) : null;
  }

  async create(input: CreatePaymentMethodInput, actor: CurrentUser, opts: { db?: Db; audit?: boolean } = {}): Promise<PaymentMethod> {
    const db = opts.db ?? this.prisma;
    const existing = await this.findByName(input.name, db);
    if (existing) throw conflict('DUPLICATE', `A payment method named "${existing.name}" already exists`);
    const count = await db.paymentMethod.count();
    if (input.isDefault) await db.paymentMethod.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const row = await db.paymentMethod.create({
      data: { name: input.name, color: input.color ?? pickColor(count), isDefault: input.isDefault ?? false, archived: input.archived ?? false, sortOrder: input.sortOrder ?? count },
    });
    const dto = toPaymentMethodDto(row);
    if (opts.audit !== false) await this.audit.log({ actor, action: 'create', entity: 'paymentMethod', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdatePaymentMethodInput, actor: CurrentUser): Promise<PaymentMethod> {
    const before = await this.get(id);
    if (input.name !== undefined && input.name.toLowerCase() !== before.name.toLowerCase()) {
      const dup = await this.findByName(input.name);
      if (dup) throw conflict('DUPLICATE', `A payment method named "${dup.name}" already exists`);
    }
    if (input.isDefault) await this.prisma.paymentMethod.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const row = await this.prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.archived === true ? { isDefault: false } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    const after = toPaymentMethodDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'paymentMethod', entityId: id, before, after });
    return after;
  }

  /**
   * Resolve per-method amounts for a new entry (expense or revenue). Explicit `payments`
   * win (total = their sum); a bare amount goes to the default method when one exists,
   * else it stays unattributed.
   */
  async resolveAmounts(input: { amountMinor?: number; payments?: { paymentMethodId: string; amountMinor: number }[] }, db: Db = this.prisma): Promise<{ total: number; payments: { paymentMethodId: string; amountMinor: number }[] }> {
    const given = (input.payments ?? []).filter((p) => p.amountMinor > 0);
    if (given.length) {
      const seen = new Set<string>();
      for (const p of given) {
        if (seen.has(p.paymentMethodId)) throw badRequest('DUPLICATE_PAYMENT_METHOD', 'Each payment method can appear once');
        seen.add(p.paymentMethodId);
        await this.get(p.paymentMethodId, db);
      }
      return { total: given.reduce((a, p) => a + p.amountMinor, 0), payments: given };
    }
    const total = input.amountMinor ?? 0;
    if (total <= 0) throw badRequest('AMOUNT_REQUIRED', 'Enter an amount, or at least one payment method amount');
    const def = await db.paymentMethod.findFirst({ where: { isDefault: true, archived: false } });
    return { total, payments: def ? [{ paymentMethodId: def.id, amountMinor: total }] : [] };
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    const [usedRevenue, usedExpenses] = await Promise.all([this.prisma.revenuePayment.count({ where: { paymentMethodId: id } }), this.prisma.expensePayment.count({ where: { paymentMethodId: id } })]);
    const used = usedRevenue + usedExpenses;
    if (used > 0) throw conflict('HAS_RECORDS', `${used} entries use this payment method. Archive it instead.`);
    await this.prisma.paymentMethod.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'paymentMethod', entityId: id, before });
  }

  async reorder(ids: string[], actor: CurrentUser): Promise<PaymentMethod[]> {
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.paymentMethod.update({ where: { id }, data: { sortOrder: i } })));
    await this.audit.log({ actor, action: 'update', entity: 'paymentMethod', entityId: null, after: { order: ids } });
    return this.list({ includeArchived: true });
  }
}
