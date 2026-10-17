import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { importTargets, parseISODate, type CustomFieldDefinition, type ImportColumn, type ImportEntity, type RangeQuery } from '@ledgr/shared';
import { LedgrContext } from '../../common/config/ledgr-config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExportService, type CsvTable } from './export.service';

/** Rows the validations cover beyond the data, so people can append in Excel. */
const SPARE_ROWS = 2000;
const LISTS_SHEET = 'Lists';

type Cell = string | number | Date | null;

/**
 * Excel export: the same columns as the dashboard table (custom columns included),
 * with dropdowns for categories, partners, select and yes/no fields, and typed
 * date / amount cells — so a file edited in Excel imports back without typos.
 */
@Injectable()
export class XlsxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly exporter: ExportService,
  ) {}

  async workbook(entity: ImportEntity, range: RangeQuery): Promise<Buffer> {
    const table = await this.exporter.table(entity, range);
    return this.build(entity, table);
  }

  async template(entity: ImportEntity): Promise<Buffer> {
    const defs = await this.exporter.definitionsFor(entity);
    const headers = importTargets(entity, defs).map((c) => c.label);
    return this.build(entity, { headers, rows: [this.exporter.exampleRow(entity, defs)] });
  }

  private async build(entity: ImportEntity, table: CsvTable): Promise<Buffer> {
    const defs = await this.exporter.definitionsFor(entity);
    const targets = importTargets(entity, defs);
    const lists = await this.lists(entity, defs);
    const currency = this.ctx.currency;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ledgr';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName(entity), { views: [{ state: 'frozen', ySplit: 1 }] });

    // Hidden sheet holding the dropdown sources.
    const ls = wb.addWorksheet(LISTS_SHEET, { state: 'veryHidden' });
    const listRefs = new Map<string, string>();
    let col = 1;
    for (const [name, values] of lists) {
      ls.getCell(1, col).value = name;
      values.forEach((v, i) => {
        ls.getCell(i + 2, col).value = v;
      });
      const letter = ls.getColumn(col).letter;
      listRefs.set(name, `${LISTS_SHEET}!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`);
      col++;
    }

    // Header
    ws.addRow(table.headers);
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } };
    header.height = 20;

    // Data
    for (const row of table.rows) {
      ws.addRow(row.map((cell, i) => this.typed(cell, targets[i], defs)));
    }

    const lastRow = Math.max(table.rows.length + 1, 2) + SPARE_ROWS;
    targets.forEach((t, i) => {
      const column = ws.getColumn(i + 1);
      const def = t.key.startsWith('cf:') ? defs.find((d) => `cf:${d.key}` === t.key) : undefined;
      const colRange = `${column.letter}2:${column.letter}${lastRow}`;
      column.width = widthFor(t, def);

      const kind = columnKind(t, def);
      if (kind === 'date') {
        column.numFmt = 'yyyy-mm-dd';
        validations(ws).add(colRange, { type: 'date', operator: 'greaterThan', formulae: [new Date(Date.UTC(1990, 0, 1))], allowBlank: !t.required, showErrorMessage: true, errorTitle: 'Date', error: 'Enter a date (YYYY-MM-DD).' });
      } else if (kind === 'money') {
        column.numFmt = '#,##0.00';
        validations(ws).add(colRange, { type: 'decimal', operator: t.key === 'amount' ? 'greaterThan' : 'greaterThanOrEqual', formulae: [0], allowBlank: !t.required, showErrorMessage: true, errorTitle: 'Amount', error: `Enter a number in ${currency}, e.g. 1250.50` });
      } else if (kind === 'number') {
        column.numFmt = '0.##';
        validations(ws).add(colRange, { type: 'decimal', formulae: [-1e15, 1e15], operator: 'between', allowBlank: !t.required, showErrorMessage: true, errorTitle: 'Number', error: 'Enter a number.' });
      } else if (kind === 'list') {
        const listName = listNameFor(t, def);
        const ref = listName ? listRefs.get(listName) : undefined;
        if (ref) {
          validations(ws).add(colRange, {
            type: 'list',
            formulae: [ref],
            allowBlank: !t.required,
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: t.label,
            error: `Pick a value from the list${t.required ? '' : ', or leave it blank'}.`,
            showInputMessage: true,
            promptTitle: t.label,
            prompt: t.description ?? 'Choose from the dropdown',
          });
        }
      }
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: targets.length } };

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  }

  /** Convert the CSV string cell into a typed Excel value (dates, numbers) where the column is typed. */
  private typed(cell: string | number | null, target: ImportColumn | undefined, defs: CustomFieldDefinition[]): Cell {
    if (cell === null || cell === '' || !target) return cell === '' ? null : cell;
    const def = target.key.startsWith('cf:') ? defs.find((d) => `cf:${d.key}` === target.key) : undefined;
    const kind = columnKind(target, def);
    if (kind === 'date' && typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell)) return parseISODate(cell);
    if (kind === 'money' || kind === 'number') {
      const n = typeof cell === 'number' ? cell : Number(String(cell).replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
    return cell;
  }

  private async lists(entity: ImportEntity, defs: CustomFieldDefinition[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (entity === 'expenses' || entity === 'revenue') {
      const cats = await this.prisma.category.findMany({ where: { kind: entity === 'expenses' ? 'expense' : 'revenue', archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      out.set('category', cats.map((c) => c.name));
    }
    if (entity === 'expenses' || entity === 'revenue' || entity === 'settlements') {
      const sh = await this.prisma.stakeholder.findMany({ where: { active: true }, orderBy: [{ sharePercent: 'desc' }, { name: 'asc' }] });
      out.set('stakeholder', sh.map((s) => s.name));
    }
    if (entity === 'revenue') {
      const pm = await this.prisma.paymentMethod.findMany({ where: { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      out.set('paymentMethod', pm.map((m) => m.name));
    }
    if (entity === 'categories') out.set('kind', ['expense', 'revenue']);
    out.set('yesno', ['yes', 'no']);
    for (const d of defs) if (d.type === 'select') out.set(`cf:${d.key}`, d.options);
    return out;
  }
}

/** exceljs ships this API at runtime but not in its typings. */
function validations(ws: ExcelJS.Worksheet): { add(range: string, v: ExcelJS.DataValidation): void } {
  return (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
}

function sheetName(entity: ImportEntity): string {
  return { expenses: 'Expenses', revenue: 'Revenue', stakeholders: 'Stakeholders', categories: 'Categories', settlements: 'Settlements' }[entity];
}

type Kind = 'date' | 'money' | 'number' | 'list' | 'text';

function columnKind(t: ImportColumn, def?: CustomFieldDefinition): Kind {
  if (def) {
    if (def.type === 'date') return 'date';
    if (def.type === 'money') return 'money';
    if (def.type === 'number') return 'number';
    if (def.type === 'select' || def.type === 'boolean') return 'list';
    return 'text';
  }
  switch (t.key) {
    case 'date':
    case 'joinedAt':
      return 'date';
    case 'amount':
    case 'monthlyBudget':
      return 'money';
    case 'sharePercent':
      return 'number';
    case 'category':
    case 'paymentMethod':
    case 'paidBy':
    case 'receivedBy':
    case 'from':
    case 'to':
    case 'kind':
      return 'list';
    default:
      return 'text';
  }
}

function listNameFor(t: ImportColumn, def?: CustomFieldDefinition): string | undefined {
  if (def) return def.type === 'boolean' ? 'yesno' : def.type === 'select' ? `cf:${def.key}` : undefined;
  if (t.key === 'category') return 'category';
  if (t.key === 'paymentMethod') return 'paymentMethod';
  if (['paidBy', 'receivedBy', 'from', 'to'].includes(t.key)) return 'stakeholder';
  if (t.key === 'kind') return 'kind';
  return undefined;
}

function widthFor(t: ImportColumn, def?: CustomFieldDefinition): number {
  const kind = columnKind(t, def);
  if (kind === 'date') return 13;
  if (kind === 'money' || kind === 'number') return 14;
  if (t.key === 'description' || t.key === 'notes') return 36;
  return Math.max(14, Math.min(28, t.label.length + 6));
}
