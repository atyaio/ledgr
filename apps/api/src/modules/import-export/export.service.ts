import { Injectable } from '@nestjs/common';
import {
  customFieldToCell,
  importTargets,
  minorToDecimalString,
  todayISO,
  toCSV,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFields,
  type ImportEntity,
  type RangeQuery,
} from '@atyaio/ledgr-shared';
import { LedgrContext } from '../../common/config/ledgr-config';
import { dateRangeWhere } from '../../common/db';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { parseCustomFields } from '../../common/json';

export const CUSTOM_FIELD_ENTITY_FOR: Partial<Record<ImportEntity, CustomFieldEntity>> = {
  expenses: 'expense',
  revenue: 'revenue',
  stakeholders: 'stakeholder',
};

export interface CsvTable {
  headers: string[];
  rows: (string | number | null)[][];
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly customFields: CustomFieldsService,
  ) {}

  async definitionsFor(entity: ImportEntity): Promise<CustomFieldDefinition[]> {
    const cfEntity = CUSTOM_FIELD_ENTITY_FOR[entity];
    return cfEntity ? this.customFields.definitions(cfEntity) : [];
  }

  /** Active payment methods, one export column each (revenue only). */
  async paymentMethodsFor(entity: ImportEntity): Promise<{ id: string; name: string }[]> {
    if (entity !== 'revenue' && entity !== 'expenses') return [];
    const rows = await this.prisma.paymentMethod.findMany({ where: { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((m) => ({ id: m.id, name: m.name }));
  }

  async targets(entity: ImportEntity) {
    const [defs, methods] = await Promise.all([this.definitionsFor(entity), this.paymentMethodsFor(entity)]);
    return { defs, methods, targets: importTargets(entity, defs, methods) };
  }

  filename(entity: ImportEntity, range: RangeQuery, ext: 'csv' | 'xlsx' = 'csv'): string {
    const from = range.from ?? 'all';
    const to = range.to ?? todayISO();
    return `${this.ctx.config.slug}-${entity}-${from}_${to}.${ext}`;
  }

  async csv(entity: ImportEntity, range: RangeQuery): Promise<string> {
    const t = await this.table(entity, range);
    return toCSV([t.headers, ...t.rows]);
  }

  async templateCsv(entity: ImportEntity): Promise<string> {
    const { defs, methods, targets } = await this.targets(entity);
    return toCSV([targets.map((c) => c.label), this.exampleRow(entity, defs, methods)]);
  }

  private money(minor: number): string {
    return minorToDecimalString(minor, this.ctx.currency);
  }

  private cfCells(values: CustomFields, defs: CustomFieldDefinition[]): string[] {
    return defs.map((d) => customFieldToCell(values[d.key] ?? null, d.type, this.ctx.currency, minorToDecimalString));
  }

  async table(entity: ImportEntity, range: RangeQuery): Promise<CsvTable> {
    const { defs, methods, targets } = await this.targets(entity);
    const headers = targets.map((c) => c.label);
    const date = dateRangeWhere(range.from, range.to);
    const dated = date ? { date } : {};
    switch (entity) {
      case 'expenses': {
        const rows = await this.prisma.expense.findMany({
          where: dated,
          include: { category: { select: { name: true } }, paidBy: { select: { name: true } }, payments: true },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        });
        return {
          headers,
          rows: rows.map((e) => [
            e.date,
            e.description,
            e.category.name,
            e.paidBy?.name ?? '',
            ...this.cfCells(parseCustomFields(e.customFields), defs),
            ...methods.map((m) => {
              const p = e.payments.find((x) => x.paymentMethodId === m.id);
              return p ? this.money(p.amountMinor) : '';
            }),
            this.money(e.amountMinor),
            e.vendor ?? '',
            e.notes ?? '',
          ]),
        };
      }
      case 'revenue': {
        const rows = await this.prisma.revenue.findMany({
          where: dated,
          include: { category: { select: { name: true } }, receivedBy: { select: { name: true } }, payments: true },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        });
        return {
          headers,
          rows: rows.map((r) => [
            r.date,
            r.description,
            r.category?.name ?? '',
            r.source ?? '',
            r.receivedBy?.name ?? '',
            ...this.cfCells(parseCustomFields(r.customFields), defs),
            ...methods.map((m) => {
              const p = r.payments.find((x) => x.paymentMethodId === m.id);
              return p ? this.money(p.amountMinor) : '';
            }),
            this.money(r.amountMinor),
            r.notes ?? '',
          ]),
        };
      }
      case 'stakeholders': {
        const rows = await this.prisma.stakeholder.findMany({ orderBy: [{ sharePercent: 'desc' }, { createdAt: 'asc' }] });
        return {
          headers,
          rows: rows.map((s) => [s.name, String(s.sharePercent), s.email ?? '', s.joinedAt ?? '', s.notes ?? '', ...this.cfCells(parseCustomFields(s.customFields), defs)]),
        };
      }
      case 'categories': {
        const rows = await this.prisma.category.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
        return {
          headers,
          rows: rows.map((c) => [c.name, c.kind, c.color, c.monthlyBudgetMinor === null ? '' : this.money(c.monthlyBudgetMinor)]),
        };
      }
      case 'settlements': {
        const rows = await this.prisma.settlement.findMany({
          where: dated,
          include: { from: { select: { name: true } }, to: { select: { name: true } } },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        });
        return { headers, rows: rows.map((s) => [s.date, s.from.name, s.to?.name ?? '', this.money(s.amountMinor), s.note ?? '']) };
      }
    }
  }

  exampleRow(entity: ImportEntity, defs: CustomFieldDefinition[], methods: { id: string; name: string }[] = []): string[] {
    const today = todayISO();
    const cf = defs.map((d) => {
      switch (d.type) {
        case 'number': return '42';
        case 'money': return this.money(12_500);
        case 'date': return today;
        case 'boolean': return 'yes';
        case 'select': return d.options[0] ?? '';
        default: return `Example ${d.label.toLowerCase()}`;
      }
    });
    switch (entity) {
      case 'expenses': {
        const perMethod = methods.map((_, i) => (i === 0 ? this.money(125_000) : ''));
        return [today, 'Cloud hosting – October', 'Hosting & infrastructure', '', ...cf, ...perMethod, this.money(125_000), 'AWS', 'Paid from the company account'];
      }
      case 'revenue': {
        const perMethod = methods.map((_, i) => (i === 0 ? this.money(2_000_000) : i === 1 ? this.money(500_000) : ''));
        return [today, 'Website redesign – milestone 2', 'Services', 'Acme Corp', '', ...cf, ...perMethod, this.money(2_500_000), ''];
      }
      case 'stakeholders': return ['Jane Doe', '50', 'jane@example.com', today, '', ...cf];
      case 'categories': return ['Marketing', 'expense', '#E0A458', this.money(500_000)];
      case 'settlements': return [today, 'Jane Doe', '', this.money(30_000), 'Reimbursement for September'];
    }
  }
}
