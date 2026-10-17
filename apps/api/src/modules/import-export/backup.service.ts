import { Injectable } from '@nestjs/common';
import type { BackupFile, Expense, ProjectConfig } from '@ledgr/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { LedgrContext } from '../../common/config/ledgr-config';
import { INTERACTIVE_TX } from '../../common/db';
import { badRequest, conflict } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { toCategoryDto } from '../categories/categories.service';
import { toCustomFieldDto } from '../custom-fields/custom-fields.service';
import { toExpenseDto } from '../expenses/expenses.service';
import { toRecurringDto } from '../recurring/recurring.service';
import { toRevenueDto } from '../revenue/revenue.service';
import { toPaymentMethodDto } from '../payment-methods/payment-methods.service';
import { toSettlementDto } from '../settlements/settlements.service';
import { toStakeholderDto } from '../stakeholders/stakeholders.service';

const CHUNK = 200;

/** Structural check only; entity contents were produced by this API. */
const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  config: z.record(z.string(), z.unknown()),
  stakeholders: z.array(z.record(z.string(), z.unknown())),
  categories: z.array(z.record(z.string(), z.unknown())),
  customFields: z.array(z.record(z.string(), z.unknown())),
  paymentMethods: z.array(z.record(z.string(), z.unknown())).optional(),
  expenses: z.array(z.record(z.string(), z.unknown())),
  revenue: z.array(z.record(z.string(), z.unknown())),
  settlements: z.array(z.record(z.string(), z.unknown())),
  recurring: z.array(z.record(z.string(), z.unknown())),
});

export interface RestoreResult {
  replaced: boolean;
  counts: Record<keyof Omit<BackupFile, 'version' | 'exportedAt' | 'config'>, number> & { expenseSplits: number };
}

@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly audit: AuditService,
  ) {}

  async export(): Promise<BackupFile> {
    const [stakeholders, categories, customFields, expenses, revenue, settlements, recurring, paymentMethods] = await Promise.all([
      this.prisma.stakeholder.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.category.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.customFieldDefinition.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.expense.findMany({
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: {
          category: { select: { id: true, name: true, color: true } },
          paidBy: { select: { id: true, name: true, color: true } },
          splits: { include: { stakeholder: { select: { name: true } } }, orderBy: { amountMinor: 'desc' } },
          payments: { include: { paymentMethod: { select: { name: true, color: true, sortOrder: true } } } },
        },
      }),
      this.prisma.revenue.findMany({
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: { category: { select: { id: true, name: true, color: true } }, receivedBy: { select: { id: true, name: true, color: true } }, payments: { include: { paymentMethod: { select: { name: true, color: true, sortOrder: true } } } } },
      }),
      this.prisma.settlement.findMany({
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: { from: { select: { id: true, name: true, color: true } }, to: { select: { id: true, name: true, color: true } } },
      }),
      this.prisma.recurringRule.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.paymentMethod.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    const { auth: _auth, ...config } = this.ctx.config;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      config,
      stakeholders: stakeholders.map(toStakeholderDto),
      categories: categories.map(toCategoryDto),
      customFields: customFields.map(toCustomFieldDto),
      paymentMethods: paymentMethods.map(toPaymentMethodDto),
      expenses: expenses.map(toExpenseDto),
      revenue: revenue.map(toRevenueDto),
      settlements: settlements.map(toSettlementDto),
      recurring: recurring.map(toRecurringDto),
    };
  }

  async hasData(): Promise<boolean> {
    const counts = await Promise.all([
      this.prisma.stakeholder.count(),
      this.prisma.category.count(),
      this.prisma.customFieldDefinition.count(),
      this.prisma.expense.count(),
      this.prisma.revenue.count(),
      this.prisma.settlement.count(),
      this.prisma.recurringRule.count(),
    ]);
    return counts.some((c) => c > 0);
  }

  async restore(raw: unknown, replace: boolean, actor: CurrentUser): Promise<RestoreResult> {
    const parsed = backupSchema.safeParse(raw);
    if (!parsed.success) throw badRequest('INVALID_BACKUP', 'Not a ledgr backup file', parsed.error.issues);
    const file = parsed.data as unknown as BackupFile;
    if ((await this.hasData()) && !replace) {
      throw conflict('NOT_EMPTY', 'This project already contains data. Pass ?replace=true to wipe it before restoring.');
    }
    const d = (s: string) => new Date(s);
    const splits = file.expenses.flatMap((e: Expense) => e.splits.map((s) => ({ ...s, expenseId: e.id })));

    await this.prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.expenseSplit.deleteMany();
        await tx.expensePayment.deleteMany();
        await tx.expense.deleteMany();
        await tx.revenuePayment.deleteMany();
        await tx.revenue.deleteMany();
        await tx.settlement.deleteMany();
        await tx.recurringRule.deleteMany();
        await tx.customFieldDefinition.deleteMany();
        await tx.category.deleteMany();
        await tx.paymentMethod.deleteMany();
        await tx.stakeholder.deleteMany();
      }
      await chunked(file.paymentMethods ?? [], (rows) =>
        tx.paymentMethod.createMany({
          data: rows.map<Prisma.PaymentMethodCreateManyInput>((m) => ({
            id: m.id,
            name: m.name,
            color: m.color,
            isDefault: m.isDefault ?? false,
            archived: m.archived ?? false,
            sortOrder: m.sortOrder ?? 0,
            createdAt: d(m.createdAt),
            updatedAt: d(m.updatedAt),
          })),
        }),
      );
      await chunked(file.stakeholders, (rows) =>
        tx.stakeholder.createMany({
          data: rows.map<Prisma.StakeholderCreateManyInput>((s) => ({
            id: s.id,
            name: s.name,
            email: s.email,
            sharePercent: s.sharePercent,
            active: s.active,
            joinedAt: s.joinedAt,
            notes: s.notes,
            color: s.color,
            customFields: JSON.stringify(s.customFields ?? {}),
            createdAt: d(s.createdAt),
            updatedAt: d(s.updatedAt),
          })),
        }),
      );
      await chunked(file.categories, (rows) =>
        tx.category.createMany({
          data: rows.map<Prisma.CategoryCreateManyInput>((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            color: c.color,
            monthlyBudgetMinor: c.monthlyBudgetMinor,
            isDefault: c.isDefault ?? false,
            archived: c.archived,
            sortOrder: c.sortOrder,
            createdAt: d(c.createdAt),
            updatedAt: d(c.updatedAt),
          })),
        }),
      );
      await chunked(file.customFields, (rows) =>
        tx.customFieldDefinition.createMany({
          data: rows.map<Prisma.CustomFieldDefinitionCreateManyInput>((f) => ({
            id: f.id,
            entity: f.entity,
            key: f.key,
            label: f.label,
            type: f.type,
            options: JSON.stringify(f.options ?? []),
            required: f.required,
            sortOrder: f.sortOrder,
            archived: f.archived,
            createdAt: d(f.createdAt),
            updatedAt: d(f.updatedAt),
          })),
        }),
      );
      await chunked(file.recurring, (rows) =>
        tx.recurringRule.createMany({
          data: rows.map<Prisma.RecurringRuleCreateManyInput>((r) => ({
            id: r.id,
            kind: r.kind,
            name: r.name,
            frequency: r.frequency,
            interval: r.interval,
            startDate: r.startDate,
            endDate: r.endDate,
            nextRunAt: r.nextRunAt,
            active: r.active,
            template: JSON.stringify(r.template),
            lastGeneratedAt: r.lastGeneratedAt,
            generatedCount: r.generatedCount,
            createdAt: d(r.createdAt),
            updatedAt: d(r.updatedAt),
          })),
        }),
      );
      await chunked(file.expenses, (rows) =>
        tx.expense.createMany({
          data: rows.map<Prisma.ExpenseCreateManyInput>((e) => ({
            id: e.id,
            date: e.date,
            amountMinor: e.amountMinor,
            description: e.description,
            categoryId: e.categoryId,
            paidByStakeholderId: e.paidByStakeholderId,
            vendor: e.vendor,
            notes: e.notes,
            splitMode: e.splitMode,
            recurringRuleId: e.recurringRuleId,
            customFields: JSON.stringify(e.customFields ?? {}),
            createdAt: d(e.createdAt),
            updatedAt: d(e.updatedAt),
          })),
        }),
      );
      await chunked(splits, (rows) =>
        tx.expenseSplit.createMany({
          data: rows.map<Prisma.ExpenseSplitCreateManyInput>((s) => ({
            id: s.id,
            expenseId: s.expenseId,
            stakeholderId: s.stakeholderId,
            sharePercent: s.sharePercent,
            amountMinor: s.amountMinor,
          })),
        }),
      );
      await chunked(file.revenue, (rows) =>
        tx.revenue.createMany({
          data: rows.map<Prisma.RevenueCreateManyInput>((r) => ({
            id: r.id,
            date: r.date,
            amountMinor: r.amountMinor,
            description: r.description,
            categoryId: r.categoryId,
            source: r.source,
            receivedByStakeholderId: r.receivedByStakeholderId,
            notes: r.notes,
            recurringRuleId: r.recurringRuleId,
            customFields: JSON.stringify(r.customFields ?? {}),
            createdAt: d(r.createdAt),
            updatedAt: d(r.updatedAt),
          })),
        }),
      );
      const payments = file.revenue.flatMap((r) => (r.payments ?? []).map((p) => ({ revenueId: r.id, paymentMethodId: p.paymentMethodId, amountMinor: p.amountMinor })));
      await chunked(payments, (rows) => tx.revenuePayment.createMany({ data: rows }));
      const expensePayments = file.expenses.flatMap((e: Expense) => (e.payments ?? []).map((p) => ({ expenseId: e.id, paymentMethodId: p.paymentMethodId, amountMinor: p.amountMinor })));
      await chunked(expensePayments, (rows) => tx.expensePayment.createMany({ data: rows }));
      await chunked(file.settlements, (rows) =>
        tx.settlement.createMany({
          data: rows.map<Prisma.SettlementCreateManyInput>((s) => ({
            id: s.id,
            date: s.date,
            fromStakeholderId: s.fromStakeholderId,
            toStakeholderId: s.toStakeholderId,
            amountMinor: s.amountMinor,
            note: s.note,
            createdAt: d(s.createdAt),
            updatedAt: d(s.updatedAt),
          })),
        }),
      );
    }, INTERACTIVE_TX);

    // Money is in the backup's currency; adopt its calendar/currency settings (slug, port and auth stay).
    const cfg = file.config as Partial<ProjectConfig>;
    this.ctx.update({
      ...(cfg.name ? { name: cfg.name } : {}),
      ...(cfg.currency ? { currency: cfg.currency } : {}),
      ...(cfg.locale ? { locale: cfg.locale } : {}),
      ...(cfg.weekStartsOn !== undefined ? { weekStartsOn: cfg.weekStartsOn } : {}),
      ...(cfg.fiscalYearStartMonth !== undefined ? { fiscalYearStartMonth: cfg.fiscalYearStartMonth } : {}),
    });

    const result: RestoreResult = {
      replaced: replace,
      counts: {
        stakeholders: file.stakeholders.length,
        categories: file.categories.length,
        customFields: file.customFields.length,
        paymentMethods: (file.paymentMethods ?? []).length,
        expenses: file.expenses.length,
        expenseSplits: splits.length,
        revenue: file.revenue.length,
        settlements: file.settlements.length,
        recurring: file.recurring.length,
      },
    };
    await this.audit.log({ actor, action: 'restore', entity: 'backup', entityId: file.exportedAt, after: result });
    return result;
  }
}

async function chunked<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}
