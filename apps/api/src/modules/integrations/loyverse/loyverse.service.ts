import { Injectable } from '@nestjs/common';
import {
  isCashLikePaymentType,
  isCashMethodName,
  type ConnectLoyverseInput,
  type IntegrationStatus,
  type ItemsSyncResponse,
  type LoyverseIntegration,
  type LoyversePaymentType,
  type LoyverseSettings,
  type LoyverseShiftPreview,
  type LoyverseStore,
  type PosItemsQuery,
  type PosItemsResponse,
  type PosSalesSummary,
  type PosShiftRef,
  type PullShiftInput,
  type PullShiftResponse,
  type ShiftSalesResponse,
  type UpdateLoyverseSettingsInput,
} from '@ledgr/shared';
import { AuditService } from '../../../common/audit/audit.service';
import type { CurrentUser } from '../../../common/auth/current-user.decorator';
import { LedgrContext } from '../../../common/config/ledgr-config';
import { toIso } from '../../../common/db';
import { ApiException, badRequest, notFound } from '../../../common/errors';
import { parseJson } from '../../../common/json';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { localDate, localTime } from '../../../common/tz';
import type { Prisma } from '../../../generated/prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import { RevenueService } from '../../revenue/revenue.service';
import { LoyverseClient } from './loyverse.client';
import { toMinor, variantName, type LvReceipt, type LvShift } from './loyverse.types';

export const PROVIDER = 'loyverse' as const;
const SOURCE_LABEL = 'Loyverse';

interface Meta {
  stores: LoyverseStore[];
  paymentTypes: LoyversePaymentType[];
}

/** What a pull computed from the shift's receipts; stored as JSON on PosShift.raw. */
interface ShiftRaw {
  shift: LvShift;
  payments: { paymentTypeId: string; name: string; type: string; amountMinor: number; pulled: boolean }[];
  totals: { receipts: number; refunds: number; grossMinor: number; netMinor: number; costMinor: number; quantity: number; paidOutMinor: number; payoutsSubtracted: boolean };
  payouts: { amountMinor: number; comment: string | null; at: string | null }[];
}

interface SaleAgg {
  externalItemId: string | null;
  itemName: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  grossMinor: number;
  netMinor: number;
  costMinor: number;
}

const DEFAULT_SETTINGS: LoyverseSettings = { storeIds: [], paymentTypeIds: [], methodMap: {}, categoryId: null, subtractPayouts: true };

type IntegrationRow = Prisma.IntegrationGetPayload<Record<string, never>>;

function shiftRef(s: { id: string; externalId: string; storeName: string | null; openedAt: Date; closedAt: Date; receipts: number }): PosShiftRef {
  return { provider: PROVIDER, shiftId: s.id, externalId: s.externalId, storeName: s.storeName, openedAt: toIso(s.openedAt), closedAt: toIso(s.closedAt), receipts: s.receipts };
}

/**
 * Loyverse POS: the merchant's catalogue (items + categories) cached locally, and closed
 * shifts pulled on demand into revenue rows. Amounts come from the shift's receipts, so a
 * refund receipt subtracts from the payment type it was refunded through.
 */
@Injectable()
export class LoyverseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly audit: AuditService,
    private readonly revenue: RevenueService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly categories: CategoriesService,
  ) {}

  // ─── Connection ─────────────────────────────────────────────────────────────

  private async row(): Promise<IntegrationRow | null> {
    return this.prisma.integration.findUnique({ where: { provider: PROVIDER } });
  }

  private async require(): Promise<IntegrationRow> {
    const r = await this.row();
    if (!r) throw badRequest('NOT_CONNECTED', 'Loyverse is not connected. Add an access token on the Integrations page first.');
    return r;
  }

  private client(r: IntegrationRow): LoyverseClient {
    return new LoyverseClient(r.accessToken);
  }

  private settingsOf(r: IntegrationRow): LoyverseSettings {
    return { ...DEFAULT_SETTINGS, ...(parseJson<Partial<LoyverseSettings>>(r.settings, {})) };
  }

  private metaOf(r: IntegrationRow): Meta {
    const m = parseJson<Partial<Meta>>(r.meta, {});
    return { stores: m.stores ?? [], paymentTypes: m.paymentTypes ?? [] };
  }

  async status(): Promise<IntegrationStatus> {
    const r = await this.row();
    if (!r) return { provider: PROVIDER, connected: false };
    return this.toDto(r);
  }

  private async toDto(r: IntegrationRow): Promise<LoyverseIntegration> {
    const [itemCount, categoryCount, shiftCount] = await Promise.all([
      this.prisma.posItem.count({ where: { provider: PROVIDER, deletedAt: null } }),
      this.prisma.posCategory.count({ where: { provider: PROVIDER, deletedAt: null } }),
      this.prisma.posShift.count({ where: { provider: PROVIDER } }),
    ]);
    const meta = this.metaOf(r);
    return {
      provider: PROVIDER,
      connected: true,
      merchantId: r.merchantId,
      merchantName: r.merchantName,
      currency: r.currency,
      decimalPlaces: r.decimalPlaces,
      settings: this.settingsOf(r),
      stores: meta.stores,
      paymentTypes: meta.paymentTypes,
      lastItemsSyncAt: r.lastItemsSyncAt ? toIso(r.lastItemsSyncAt) : null,
      lastShiftPullAt: r.lastShiftPullAt ? toIso(r.lastShiftPullAt) : null,
      lastError: r.lastError,
      itemCount,
      categoryCount,
      shiftCount,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    };
  }

  /** Verify the token against /merchant, cache stores + payment types, default to pulling cash. */
  async connect(input: ConnectLoyverseInput, actor: CurrentUser): Promise<LoyverseIntegration> {
    const client = new LoyverseClient(input.accessToken);
    const merchant = await client.merchant();
    const code = merchant.currency?.code?.toUpperCase();
    if (code && code !== this.ctx.currency) {
      throw badRequest('CURRENCY_MISMATCH', `This Loyverse account is in ${code} but the project is in ${this.ctx.currency}.`, { loyverse: code, project: this.ctx.currency });
    }
    const [stores, paymentTypes] = await Promise.all([client.stores(), client.paymentTypes()]);
    const meta: Meta = {
      stores: stores.filter((s) => !s.deleted_at).map((s) => ({ id: s.id, name: s.name })),
      paymentTypes: paymentTypes.filter((p) => !p.deleted_at).map((p) => ({ id: p.id, name: p.name, type: p.type })),
    };
    const existing = await this.row();
    const prev = existing ? this.settingsOf(existing) : DEFAULT_SETTINGS;
    const known = new Set(meta.paymentTypes.map((p) => p.id));
    const settings: LoyverseSettings = {
      ...prev,
      storeIds: prev.storeIds.filter((id) => meta.stores.some((s) => s.id === id)),
      paymentTypeIds: prev.paymentTypeIds.filter((id) => known.has(id)).length ? prev.paymentTypeIds.filter((id) => known.has(id)) : meta.paymentTypes.filter(isCashLikePaymentType).map((p) => p.id),
      methodMap: Object.fromEntries(Object.entries(prev.methodMap).filter(([k]) => known.has(k))),
    };
    const data = {
      accessToken: input.accessToken,
      merchantId: merchant.id ?? null,
      merchantName: merchant.business_name ?? null,
      currency: code ?? null,
      decimalPlaces: merchant.currency?.decimal_places ?? 2,
      settings: JSON.stringify(settings),
      meta: JSON.stringify(meta),
      lastError: null,
    };
    const row = existing
      ? await this.prisma.integration.update({ where: { provider: PROVIDER }, data })
      : await this.prisma.integration.create({ data: { provider: PROVIDER, ...data } });
    const dto = await this.toDto(row);
    await this.audit.log({ actor, action: existing ? 'update' : 'create', entity: 'integration', entityId: PROVIDER, after: { merchant: dto.merchantName, stores: meta.stores.length, paymentTypes: meta.paymentTypes.length } });
    return dto;
  }

  /** Forget the token and the cached catalogue. Pulled revenue rows stay in the ledger. */
  async disconnect(actor: CurrentUser): Promise<void> {
    const r = await this.require();
    await this.prisma.$transaction([
      this.prisma.posShift.deleteMany({ where: { provider: PROVIDER } }),
      this.prisma.posItem.deleteMany({ where: { provider: PROVIDER } }),
      this.prisma.posCategory.deleteMany({ where: { provider: PROVIDER } }),
      this.prisma.integration.delete({ where: { id: r.id } }),
    ]);
    await this.audit.log({ actor, action: 'delete', entity: 'integration', entityId: PROVIDER, before: { merchant: r.merchantName } });
  }

  async updateSettings(input: UpdateLoyverseSettingsInput, actor: CurrentUser): Promise<LoyverseIntegration> {
    const r = await this.require();
    const meta = this.metaOf(r);
    const before = this.settingsOf(r);
    const next: LoyverseSettings = { ...before };
    if (input.storeIds !== undefined) {
      const bad = input.storeIds.find((id) => !meta.stores.some((s) => s.id === id));
      if (bad) throw badRequest('UNKNOWN_STORE', `Unknown Loyverse store ${bad}`);
      next.storeIds = [...new Set(input.storeIds)];
    }
    if (input.paymentTypeIds !== undefined) {
      const bad = input.paymentTypeIds.find((id) => !meta.paymentTypes.some((p) => p.id === id));
      if (bad) throw badRequest('UNKNOWN_PAYMENT_TYPE', `Unknown Loyverse payment type ${bad}`);
      next.paymentTypeIds = [...new Set(input.paymentTypeIds)];
    }
    if (input.methodMap !== undefined) {
      for (const [ptId, methodId] of Object.entries(input.methodMap)) {
        if (!meta.paymentTypes.some((p) => p.id === ptId)) throw badRequest('UNKNOWN_PAYMENT_TYPE', `Unknown Loyverse payment type ${ptId}`);
        await this.paymentMethods.get(methodId);
      }
      next.methodMap = { ...input.methodMap };
    }
    if (input.categoryId !== undefined) {
      if (input.categoryId) await this.categories.requireKind(input.categoryId, 'revenue');
      next.categoryId = input.categoryId;
    }
    if (input.subtractPayouts !== undefined) next.subtractPayouts = input.subtractPayouts;
    const row = await this.prisma.integration.update({ where: { id: r.id }, data: { settings: JSON.stringify(next) } });
    await this.audit.log({ actor, action: 'update', entity: 'integration', entityId: PROVIDER, before, after: next });
    return this.toDto(row);
  }

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  /** Pull categories + items; rows that vanished upstream are marked deleted (sales keep their names). */
  async syncItems(actor: CurrentUser): Promise<ItemsSyncResponse> {
    const r = await this.require();
    const client = this.client(r);
    try {
      const [cats, items, stores, paymentTypes] = await Promise.all([client.categories(), client.items(), client.stores(), client.paymentTypes()]);
      const now = new Date();
      let removed = 0;
      await this.prisma.$transaction(async (tx) => {
        const catIds = new Map<string, string>();
        for (const c of cats) {
          const row = await tx.posCategory.upsert({
            where: { provider_externalId: { provider: PROVIDER, externalId: c.id } },
            create: { provider: PROVIDER, externalId: c.id, name: c.name, color: c.color ?? null, deletedAt: c.deleted_at ? new Date(c.deleted_at) : null },
            update: { name: c.name, color: c.color ?? null, deletedAt: c.deleted_at ? new Date(c.deleted_at) : null },
          });
          catIds.set(c.id, row.id);
        }
        const seenCats = new Set(cats.map((c) => c.id));
        const goneCats = await tx.posCategory.updateMany({ where: { provider: PROVIDER, deletedAt: null, externalId: { notIn: [...seenCats] } }, data: { deletedAt: now } });
        removed += goneCats.count;

        for (const it of items) {
          const variants = (it.variants ?? []).filter((v) => !v.deleted_at);
          const first = variants[0];
          const data = {
            name: it.item_name,
            categoryId: it.category_id ? (catIds.get(it.category_id) ?? null) : null,
            sku: variants.length === 1 ? (first?.sku ?? null) : null,
            priceMinor: first?.default_price !== null && first?.default_price !== undefined ? toMinor(first.default_price, r.decimalPlaces) : null,
            costMinor: first?.cost !== null && first?.cost !== undefined ? toMinor(first.cost, r.decimalPlaces) : null,
            variantCount: Math.max(1, variants.length),
            deletedAt: it.deleted_at ? new Date(it.deleted_at) : null,
          };
          await tx.posItem.upsert({ where: { provider_externalId: { provider: PROVIDER, externalId: it.id } }, create: { provider: PROVIDER, externalId: it.id, ...data }, update: data });
        }
        const seenItems = new Set(items.map((i) => i.id));
        const goneItems = await tx.posItem.updateMany({ where: { provider: PROVIDER, deletedAt: null, externalId: { notIn: [...seenItems] } }, data: { deletedAt: now } });
        removed += goneItems.count;

        const meta: Meta = {
          stores: stores.filter((s) => !s.deleted_at).map((s) => ({ id: s.id, name: s.name })),
          paymentTypes: paymentTypes.filter((p) => !p.deleted_at).map((p) => ({ id: p.id, name: p.name, type: p.type })),
        };
        await tx.integration.update({ where: { id: r.id }, data: { lastItemsSyncAt: now, lastError: null, meta: JSON.stringify(meta) } });
      });
      const res: ItemsSyncResponse = { categories: cats.length, items: items.length, removed, syncedAt: toIso(now) };
      await this.audit.log({ actor, action: 'import', entity: 'posItem', entityId: null, after: res });
      return res;
    } catch (e) {
      await this.recordError(r.id, e);
      throw e;
    }
  }

  async listItems(q: PosItemsQuery): Promise<PosItemsResponse> {
    await this.require();
    const where: Prisma.PosItemWhereInput = {
      provider: PROVIDER,
      ...(q.includeDeleted ? {} : { deletedAt: null }),
      ...(q.categoryId ? (q.categoryId === 'none' ? { categoryId: null } : { categoryId: q.categoryId }) : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q } }, { sku: { contains: q.q } }] } : {}),
    };
    const [rows, cats, total] = await Promise.all([
      this.prisma.posItem.findMany({ where, include: { category: { select: { id: true, name: true, color: true } } }, orderBy: [{ name: 'asc' }], take: 2000 }),
      this.prisma.posCategory.findMany({ where: { provider: PROVIDER }, include: { _count: { select: { items: { where: { deletedAt: null } } } } }, orderBy: { name: 'asc' } }),
      this.prisma.posItem.count({ where }),
    ]);
    return {
      items: rows.map((i) => ({
        id: i.id,
        externalId: i.externalId,
        name: i.name,
        categoryId: i.categoryId,
        category: i.category,
        sku: i.sku,
        priceMinor: i.priceMinor,
        costMinor: i.costMinor,
        variantCount: i.variantCount,
        deletedAt: i.deletedAt ? toIso(i.deletedAt) : null,
        updatedAt: toIso(i.updatedAt),
      })),
      categories: cats.map((c) => ({ id: c.id, externalId: c.externalId, name: c.name, color: c.color, itemCount: c._count.items, deletedAt: c.deletedAt ? toIso(c.deletedAt) : null })),
      total,
    };
  }

  // ─── Shifts ─────────────────────────────────────────────────────────────────

  private pulledTypeIds(r: IntegrationRow): Set<string> {
    const s = this.settingsOf(r);
    const meta = this.metaOf(r);
    const ids = s.paymentTypeIds.length ? s.paymentTypeIds : meta.paymentTypes.filter(isCashLikePaymentType).map((p) => p.id);
    return new Set(ids);
  }

  /** Closed shifts the provider reports, newest first, flagged when ledgr already holds them. */
  async recentShifts(limit: number): Promise<LoyverseShiftPreview[]> {
    const r = await this.require();
    const s = this.settingsOf(r);
    const meta = this.metaOf(r);
    const client = this.client(r);
    let shifts: LvShift[];
    try {
      shifts = await client.shifts({ store_ids: s.storeIds.length ? s.storeIds.join(',') : undefined, limit: Math.min(50, limit + 5) });
    } catch (e) {
      await this.recordError(r.id, e);
      throw e;
    }
    const closed = shifts.filter((x) => !!x.closed_at).slice(0, limit);
    const pulled = await this.prisma.posShift.findMany({ where: { provider: PROVIDER, externalId: { in: closed.map((x) => x.id) } }, select: { id: true, externalId: true, revenueId: true, pulledAt: true } });
    const byExt = new Map(pulled.map((p) => [p.externalId, p]));
    const selected = this.pulledTypeIds(r);
    const typeById = new Map(meta.paymentTypes.map((p) => [p.id, p]));
    return closed.map((x) => {
      const p = byExt.get(x.id);
      return {
        externalId: x.id,
        storeId: x.store_id,
        storeName: meta.stores.find((st) => st.id === x.store_id)?.name ?? null,
        openedAt: x.opened_at,
        closedAt: x.closed_at as string,
        grossSalesMinor: toMinor(x.gross_sales, r.decimalPlaces),
        netSalesMinor: toMinor(x.net_sales, r.decimalPlaces),
        refundsMinor: toMinor(x.refunds, r.decimalPlaces),
        cashMinor: toMinor((x.cash_payments ?? 0) - (x.cash_refunds ?? 0), r.decimalPlaces),
        paidOutMinor: toMinor(x.paid_out, r.decimalPlaces),
        payments: (x.payments ?? []).map((pm) => ({ paymentTypeId: pm.payment_type_id, name: typeById.get(pm.payment_type_id)?.name ?? pm.payment_type_id, type: typeById.get(pm.payment_type_id)?.type ?? 'OTHER', amountMinor: toMinor(pm.money_amount, r.decimalPlaces), selected: selected.has(pm.payment_type_id) })),
        pulled: p ? { shiftId: p.id, revenueId: p.revenueId, pulledAt: toIso(p.pulledAt) } : null,
      };
    });
  }

  /** Pull one closed shift (the latest when no id is given) into a revenue row; re-pulling updates that row. */
  async pullShift(input: PullShiftInput, actor: CurrentUser): Promise<PullShiftResponse> {
    const r = await this.require();
    const settings = this.settingsOf(r);
    const meta = this.metaOf(r);
    const client = this.client(r);
    const tz = this.ctx.config.timezone;
    try {
      let shift: LvShift | undefined;
      if (input.shiftId) {
        shift = await client.shift(input.shiftId);
      } else {
        const list = await client.shifts({ store_ids: settings.storeIds.length ? settings.storeIds.join(',') : undefined, limit: 10 });
        shift = list.find((x) => !!x.closed_at);
        if (!shift) throw badRequest('NO_CLOSED_SHIFT', 'Loyverse has no closed shift yet. Close the shift in the POS app, then pull it.');
      }
      if (!shift.closed_at) throw badRequest('SHIFT_OPEN', 'This shift is still open. Close it in the POS app first.');
      if (settings.storeIds.length && !settings.storeIds.includes(shift.store_id)) throw badRequest('STORE_NOT_SELECTED', 'This shift belongs to a store that is not selected in the integration settings.');

      // Receipts of the shift: same store, created inside the shift window, same POS device when known.
      const all = await client.receipts({ store_id: shift.store_id, created_at_min: shift.opened_at, created_at_max: shift.closed_at });
      const device = shift.pos_device_id;
      const receipts = all.filter((rc) => !rc.cancelled_at && (!device || !rc.pos_device_id || rc.pos_device_id === device));
      const agg = this.aggregate(receipts, r.decimalPlaces);

      // Amounts per pulled payment type → ledgr payment methods (matched or created by name).
      const pulledIds = this.pulledTypeIds(r);
      const typeById = new Map(meta.paymentTypes.map((p) => [p.id, p]));
      const payments: { paymentMethodId: string; amountMinor: number }[] = [];
      const methodMap = { ...settings.methodMap };
      for (const id of pulledIds) {
        const amount = agg.payments.get(id) ?? 0;
        if (amount <= 0) continue;
        const pt = typeById.get(id);
        const methodId = await this.resolveMethod(id, pt ?? { id, name: id, type: 'OTHER' }, methodMap, actor);
        const existing = payments.find((p) => p.paymentMethodId === methodId);
        if (existing) existing.amountMinor += amount;
        else payments.push({ paymentMethodId: methodId, amountMinor: amount });
      }
      // Cash pay-outs (supplies bought from the till) come off the drawer's own cash type.
      const paidOutMinor = toMinor(shift.paid_out ?? (shift.cash_movements ?? []).filter((m) => m.type === 'PAY_OUT').reduce((a, m) => a + m.money_amount, 0), r.decimalPlaces);
      let payoutsSubtracted = false;
      if (settings.subtractPayouts && paidOutMinor > 0) {
        const drawerType = [...pulledIds].find((id) => typeById.get(id)?.type === 'CASH');
        const drawerMethod = drawerType ? methodMap[drawerType] : undefined;
        const entry = drawerMethod ? payments.find((p) => p.paymentMethodId === drawerMethod) : undefined;
        if (entry) {
          entry.amountMinor = Math.max(0, entry.amountMinor - paidOutMinor);
          payoutsSubtracted = true;
          if (entry.amountMinor === 0) payments.splice(payments.indexOf(entry), 1);
        }
      }
      if (!payments.length) {
        const names = [...pulledIds].map((id) => typeById.get(id)?.name ?? id).join(', ');
        throw badRequest('EMPTY_SHIFT', `No sales through ${names || 'the selected payment types'} in this shift (${receipts.length} receipts).`);
      }

      const storeName = meta.stores.find((s) => s.id === shift.store_id)?.name ?? null;
      const date = localDate(shift.opened_at, tz); // a shift that closes after midnight belongs to the day it opened
      const description = `Shift · ${storeName ?? 'Loyverse'} · ${localTime(shift.opened_at, tz)}–${localTime(shift.closed_at, tz)}`;
      const categoryId = settings.categoryId ?? (await this.prisma.category.findFirst({ where: { kind: 'revenue', isDefault: true, archived: false } }))?.id ?? null;

      const prior = await this.prisma.posShift.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: shift.id } } });
      const priorRevenue = prior?.revenueId ? await this.prisma.revenue.findUnique({ where: { id: prior.revenueId }, select: { id: true } }) : null;
      let created = false;
      let revenue;
      if (priorRevenue) {
        revenue = await this.revenue.update(priorRevenue.id, { date, description, payments }, actor);
      } else {
        revenue = await this.revenue.create({ date, description, categoryId, source: SOURCE_LABEL, payments, customFields: {} }, actor);
        created = true;
      }

      const raw: ShiftRaw = {
        shift,
        payments: [...agg.payments.entries()].map(([id, amountMinor]) => ({ paymentTypeId: id, name: typeById.get(id)?.name ?? agg.paymentNames.get(id) ?? id, type: typeById.get(id)?.type ?? agg.paymentKinds.get(id) ?? 'OTHER', amountMinor, pulled: pulledIds.has(id) })),
        totals: { ...agg.totals, paidOutMinor, payoutsSubtracted },
        payouts: (shift.cash_movements ?? []).filter((m) => m.type === 'PAY_OUT').map((m) => ({ amountMinor: toMinor(m.money_amount, r.decimalPlaces), comment: m.comment?.trim() || null, at: m.created_at ?? null })),
      };
      const items = await this.prisma.posItem.findMany({ where: { provider: PROVIDER, externalId: { in: [...new Set([...agg.lines.values()].map((l) => l.externalItemId).filter((x): x is string => !!x))] } }, include: { category: { select: { name: true } } } });
      const itemByExt = new Map(items.map((i) => [i.externalId, i]));
      const shiftRow = await this.prisma.$transaction(async (tx) => {
        const data = { storeId: shift!.store_id, storeName, openedAt: new Date(shift!.opened_at), closedAt: new Date(shift!.closed_at as string), raw: JSON.stringify(raw), receipts: receipts.length, revenueId: revenue.id, pulledAt: new Date() };
        const row = prior
          ? await tx.posShift.update({ where: { id: prior.id }, data })
          : await tx.posShift.create({ data: { provider: PROVIDER, externalId: shift!.id, ...data } });
        await tx.posSale.deleteMany({ where: { shiftId: row.id } });
        const lines = [...agg.lines.values()].filter((l) => l.quantity !== 0 || l.netMinor !== 0);
        if (lines.length) {
          await tx.posSale.createMany({
            data: lines.map((l) => {
              const item = l.externalItemId ? itemByExt.get(l.externalItemId) : undefined;
              return { shiftId: row.id, itemId: item?.id ?? null, externalItemId: l.externalItemId, itemName: l.itemName, variantName: l.variantName, sku: l.sku, categoryName: item?.category?.name ?? null, quantity: l.quantity, grossMinor: l.grossMinor, netMinor: l.netMinor, costMinor: l.costMinor };
            }),
          });
        }
        await tx.integration.update({ where: { id: r.id }, data: { lastShiftPullAt: new Date(), lastError: null, settings: JSON.stringify({ ...settings, methodMap }) } });
        return row;
      });
      await this.audit.log({ actor, action: 'import', entity: 'posShift', entityId: shiftRow.id, after: { shift: shift.id, store: storeName, date, revenueId: revenue.id, created, receipts: receipts.length, payments, paidOutMinor, payoutsSubtracted } });
      const fresh = await this.revenue.get(revenue.id);
      return { revenue: fresh, shift: shiftRef(shiftRow), created, sales: await this.shiftSales(shiftRow.id) };
    } catch (e) {
      await this.recordError(r.id, e);
      throw e;
    }
  }

  /**
   * Loyverse payment type → ledgr payment method. An explicit `methodMap` entry wins.
   * Cash-like types (CASH, "Talabat cash", "طلبات كاش"…) all fold into the ledger's one
   * cash method, found by name in either language or created as "Cash". Other types match
   * a method by name or get one created with the same name.
   */
  private async resolveMethod(paymentTypeId: string, pt: LoyversePaymentType, methodMap: Record<string, string>, actor: CurrentUser): Promise<string> {
    const mapped = methodMap[paymentTypeId];
    if (mapped) {
      const exists = await this.prisma.paymentMethod.findUnique({ where: { id: mapped } });
      if (exists) return exists.id;
    }
    let method = await this.paymentMethods.findByName(pt.name);
    if (!method && isCashLikePaymentType(pt)) {
      const all = await this.prisma.paymentMethod.findMany({ where: { archived: false }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] });
      const cash = all.find((m) => isCashMethodName(m.name) || isCashMethodName(m.nameAr));
      method = cash ? await this.paymentMethods.get(cash.id) : await this.paymentMethods.create({ name: 'Cash', nameAr: 'نقداً', isDefault: all.length === 0 }, actor);
    }
    if (!method) method = await this.paymentMethods.create({ name: pt.name, isDefault: (await this.prisma.paymentMethod.count()) === 0 }, actor);
    methodMap[paymentTypeId] = method.id;
    return method.id;
  }

  /** Sum receipts: SALE adds, REFUND subtracts; per payment type and per item variant. */
  private aggregate(receipts: LvReceipt[], decimals: number) {
    const payments = new Map<string, number>();
    const paymentNames = new Map<string, string>();
    const paymentKinds = new Map<string, string>();
    const lines = new Map<string, SaleAgg>();
    const totals = { receipts: 0, refunds: 0, grossMinor: 0, netMinor: 0, costMinor: 0, quantity: 0 };
    for (const rc of receipts) {
      const sign = rc.receipt_type === 'REFUND' ? -1 : 1;
      if (sign < 0) totals.refunds += 1;
      else totals.receipts += 1;
      for (const p of rc.payments ?? []) {
        payments.set(p.payment_type_id, (payments.get(p.payment_type_id) ?? 0) + sign * toMinor(p.money_amount, decimals));
        if (p.name) paymentNames.set(p.payment_type_id, p.name);
        if (p.type) paymentKinds.set(p.payment_type_id, p.type);
      }
      for (const li of rc.line_items ?? []) {
        const key = li.variant_id ?? li.item_id ?? `name:${li.item_name}`;
        const cur = lines.get(key) ?? { externalItemId: li.item_id ?? null, itemName: li.item_name, variantName: li.variant_name ?? null, sku: li.sku ?? null, quantity: 0, grossMinor: 0, netMinor: 0, costMinor: 0 };
        const qty = sign * (li.quantity ?? 0);
        const gross = sign * toMinor(li.gross_total_money ?? (li.price ?? 0) * (li.quantity ?? 0), decimals);
        const net = sign * toMinor(li.total_money ?? li.gross_total_money ?? 0, decimals);
        const cost = sign * toMinor(li.cost_total ?? (li.cost ?? 0) * (li.quantity ?? 0), decimals);
        cur.quantity += qty;
        cur.grossMinor += gross;
        cur.netMinor += net;
        cur.costMinor += cost;
        lines.set(key, cur);
        totals.quantity += qty;
        totals.grossMinor += gross;
        totals.netMinor += net;
        totals.costMinor += cost;
      }
    }
    return { payments, paymentNames, paymentKinds, lines, totals };
  }

  async shiftSales(shiftId: string): Promise<ShiftSalesResponse> {
    const row = await this.prisma.posShift.findUnique({ where: { id: shiftId }, include: { sales: { orderBy: { netMinor: 'desc' } } } });
    if (!row) throw notFound('Shift', shiftId);
    const raw = parseJson<ShiftRaw | null>(row.raw, null);
    const t = raw?.totals as Partial<ShiftRaw['totals']> | undefined; // rows pulled before pay-outs existed lack the new fields
    const lines = row.sales.map((s) => ({ itemId: s.itemId, externalItemId: s.externalItemId, itemName: s.itemName, variantName: s.variantName, sku: s.sku, categoryName: s.categoryName, quantity: s.quantity, grossMinor: s.grossMinor, netMinor: s.netMinor, costMinor: s.costMinor }));
    const net = lines.reduce((a, l) => a + l.netMinor, 0);
    const cats = new Map<string, { name: string; quantity: number; netMinor: number }>();
    for (const l of lines) {
      const name = l.categoryName ?? '';
      const c = cats.get(name) ?? { name, quantity: 0, netMinor: 0 };
      c.quantity += l.quantity;
      c.netMinor += l.netMinor;
      cats.set(name, c);
    }
    return {
      shift: shiftRef(row),
      payments: raw?.payments ?? [],
      totals: { receipts: t?.receipts ?? row.receipts, refunds: t?.refunds ?? 0, grossMinor: t?.grossMinor ?? 0, netMinor: t?.netMinor ?? net, costMinor: t?.costMinor ?? 0, quantity: t?.quantity ?? 0, paidOutMinor: t?.paidOutMinor ?? 0, payoutsSubtracted: t?.payoutsSubtracted ?? false },
      payouts: raw?.payouts ?? [],
      lines,
      byCategory: [...cats.values()].sort((a, b) => b.netMinor - a.netMinor).map((c) => ({ ...c, pct: net > 0 ? (c.netMinor / net) * 100 : 0 })),
    };
  }

  /** Sales on pulled shifts whose revenue row falls in the range; null when there are none. */
  async salesSummary(range: { from: string; to: string }, limit = 15): Promise<PosSalesSummary | null> {
    const sales = await this.prisma.posSale.findMany({ where: { shift: { provider: PROVIDER, revenue: { date: { gte: range.from, lte: range.to } } } }, select: { shiftId: true, itemName: true, variantName: true, categoryName: true, quantity: true, netMinor: true, costMinor: true } });
    if (!sales.length) return null;
    const shifts = new Set(sales.map((s) => s.shiftId));
    const items = new Map<string, { itemName: string; variantName: string | null; categoryName: string | null; quantity: number; netMinor: number }>();
    const cats = new Map<string, { name: string; quantity: number; netMinor: number }>();
    let net = 0;
    let cost = 0;
    let qty = 0;
    for (const s of sales) {
      const k = `${s.itemName}|${s.variantName ?? ''}`;
      const i = items.get(k) ?? { itemName: s.itemName, variantName: s.variantName, categoryName: s.categoryName, quantity: 0, netMinor: 0 };
      i.quantity += s.quantity;
      i.netMinor += s.netMinor;
      items.set(k, i);
      const cn = s.categoryName ?? '';
      const c = cats.get(cn) ?? { name: cn, quantity: 0, netMinor: 0 };
      c.quantity += s.quantity;
      c.netMinor += s.netMinor;
      cats.set(cn, c);
      net += s.netMinor;
      cost += s.costMinor;
      qty += s.quantity;
    }
    const pctOf = (n: number) => (net > 0 ? (n / net) * 100 : 0);
    return {
      shifts: shifts.size,
      quantity: qty,
      netMinor: net,
      costMinor: cost,
      byItem: [...items.values()].sort((a, b) => b.netMinor - a.netMinor).slice(0, limit).map((i) => ({ ...i, pct: pctOf(i.netMinor) })),
      byCategory: [...cats.values()].sort((a, b) => b.netMinor - a.netMinor).map((c) => ({ ...c, pct: pctOf(c.netMinor) })),
    };
  }

  private async recordError(id: string, e: unknown): Promise<void> {
    const body = e instanceof ApiException ? (e.getResponse() as { message?: string }) : null;
    const msg = body?.message ?? (e instanceof Error ? e.message : String(e));
    await this.prisma.integration.update({ where: { id }, data: { lastError: msg.slice(0, 500) } }).catch(() => undefined);
  }
}
