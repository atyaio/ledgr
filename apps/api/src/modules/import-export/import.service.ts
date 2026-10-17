import { Injectable } from '@nestjs/common';
import {
  createCategorySchema,
  createExpenseSchema,
  createRevenueSchema,
  createSettlementSchema,
  createStakeholderSchema,
  detectDateFormat,
  importTargets,
  parseDateCell,
  parseMoney,
  suggestMapping,
  type Category,
  type CategoryKind,
  type CustomFieldDefinition,
  type CustomFields,
  type ImportCommitInput,
  type ImportCommitResponse,
  type ImportEntity,
  type ImportOptions,
  type ImportPreviewResponse,
  type Stakeholder,
} from '@ledgr/shared';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { ZodError, type ZodType } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { LedgrContext } from '../../common/config/ledgr-config';
import { INTERACTIVE_TX, type Db } from '../../common/db';
import { ApiException, badRequest } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { ExpensesService } from '../expenses/expenses.service';
import { RevenueService } from '../revenue/revenue.service';
import { SettlementsService } from '../settlements/settlements.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { CUSTOM_FIELD_ENTITY_FOR, ExportService } from './export.service';

const CHUNK = 200;
const PREVIEW_ROWS = 5;

type Row = Record<string, string>;

export interface ParsedCsv {
  headers: string[];
  rows: Row[];
}

interface RowError {
  row: number;
  message: string;
}

/** A row that parsed cleanly and is ready to insert through a domain service. */
interface Prepared<T> {
  line: number;
  input: T;
  dupKey: string;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly categories: CategoriesService,
    private readonly stakeholders: StakeholdersService,
    private readonly expenses: ExpensesService,
    private readonly revenue: RevenueService,
    private readonly settlements: SettlementsService,
  ) {}

  // ─── Parsing ────────────────────────────────────────────────────────────────

  async parse(buffer: Buffer, filename = ''): Promise<ParsedCsv> {
    if (/\.xlsx?$/i.test(filename) || isZip(buffer)) return this.parseXlsx(buffer);
    return this.parseCsv(buffer);
  }

  /** First worksheet of an Excel file → the same {headers, rows} shape as CSV. Dates become YYYY-MM-DD. */
  async parseXlsx(buffer: Buffer): Promise<ParsedCsv> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    } catch {
      throw badRequest('XLSX_PARSE', 'Could not read this Excel file');
    }
    const ws = wb.worksheets.find((w) => w.state === 'visible') ?? wb.worksheets[0];
    if (!ws) throw badRequest('EMPTY_XLSX', 'The workbook has no sheets');
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = cellText(cell.value).trim();
    });
    const clean = headers.map((h) => h ?? '');
    if (!clean.some((h) => h.length > 0)) throw badRequest('EMPTY_XLSX', 'The file has no header row');
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const r: Row = {};
      let any = false;
      clean.forEach((h, i) => {
        if (!h) return;
        const v = cellText(row.getCell(i + 1).value);
        if (v !== '') any = true;
        r[h] = v;
      });
      if (any) rows.push(r);
    });
    return { headers: clean.filter((h) => h.length > 0), rows };
  }

  parseCsv(buffer: Buffer): ParsedCsv {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const result = Papa.parse<Row>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
    const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
    if (headers.length === 0) throw badRequest('EMPTY_CSV', 'The file has no header row');
    const fatal = result.errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw badRequest('CSV_PARSE', fatal[0].message, fatal.slice(0, 5));
    return { headers, rows: result.data };
  }

  async preview(entity: ImportEntity, buffer: Buffer, filename = ''): Promise<ImportPreviewResponse> {
    const { headers, rows } = await this.parse(buffer, filename);
    const defs = await this.exporter.definitionsFor(entity);
    const targets = importTargets(entity, defs);
    const suggestedMapping = suggestMapping(headers, targets);
    const dateHeader = suggestedMapping['date'] ?? suggestedMapping['joinedAt'];
    const detectedDateFormat = dateHeader ? detectDateFormat(rows.slice(0, 200).map((r) => r[dateHeader] ?? '')) : 'auto';
    return {
      headers,
      sampleRows: rows.slice(0, PREVIEW_ROWS).map((r) => headers.map((h) => r[h] ?? '')),
      rowCount: rows.length,
      targets,
      suggestedMapping,
      detectedDateFormat,
    };
  }

  // ─── Commit ─────────────────────────────────────────────────────────────────

  async commit(entity: ImportEntity, buffer: Buffer, input: ImportCommitInput, actor: CurrentUser, filename = ''): Promise<ImportCommitResponse> {
    const { headers, rows } = await this.parse(buffer, filename);
    const defs = await this.exporter.definitionsFor(entity);
    const targets = importTargets(entity, defs);
    const mapping = input.mapping;
    const missing = targets.filter((t) => t.required && !mapping[t.key]);
    if (missing.length) throw badRequest('MAPPING', `Map the required column(s): ${missing.map((m) => m.label).join(', ')}`, missing.map((m) => m.key));
    const unknown = Object.values(mapping).filter((h): h is string => !!h && !headers.includes(h));
    if (unknown.length) throw badRequest('MAPPING', `Mapped columns not found in file: ${unknown.join(', ')}`, unknown);

    const batchId = `imp_${Date.now().toString(36)}`;
    const ctx = new ImportContext(this, rows, mapping, input.options, defs, actor, batchId);
    const result = await (() => {
      switch (entity) {
        case 'expenses': return ctx.expenses();
        case 'revenue': return ctx.revenue();
        case 'stakeholders': return ctx.stakeholders();
        case 'categories': return ctx.categories();
        case 'settlements': return ctx.settlements();
      }
    })();
    await this.audit.log({
      actor,
      action: 'import',
      entity,
      entityId: batchId,
      after: {
        rows: rows.length,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors.length,
        createdCategories: ctx.createdCategories,
        createdStakeholders: ctx.createdStakeholders,
        options: input.options,
      },
    });
    return result;
  }

  // ─── Helpers exposed to ImportContext ─────────────────────────────────────

  get currency(): string {
    return this.ctx.currency;
  }
  get db(): PrismaService {
    return this.prisma;
  }
  get svc() {
    return { categories: this.categories, stakeholders: this.stakeholders, expenses: this.expenses, revenue: this.revenue, settlements: this.settlements };
  }
}

/** One import run: name resolution caches, duplicate detection, chunked inserts. */
class ImportContext {
  createdCategories = 0;
  createdStakeholders = 0;
  private readonly errors: RowError[] = [];
  private skipped = 0;
  private inserted = 0;
  private categoryCache = new Map<string, Category>();
  private stakeholderCache = new Map<string, Stakeholder>();

  constructor(
    private readonly s: ImportService,
    private readonly rows: Row[],
    private readonly mapping: Record<string, string | null>,
    private readonly options: ImportOptions,
    private readonly defs: CustomFieldDefinition[],
    private readonly actor: CurrentUser,
    private readonly batchId: string,
  ) {}

  // ─── Cell access ────────────────────────────────────────────────────────────

  private cell(row: Row, key: string): string {
    const h = this.mapping[key];
    return h ? (row[h] ?? '').trim() : '';
  }
  private opt(row: Row, key: string): string | null {
    const v = this.cell(row, key);
    return v === '' ? null : v;
  }
  private date(row: Row, key: string, required: boolean): string | null {
    const raw = this.cell(row, key);
    if (!raw) {
      if (required) throw new RowFail('Date is missing');
      return null;
    }
    const d = parseDateCell(raw, this.options.dateFormat);
    if (!d) throw new RowFail(`Unrecognised date "${raw}"`);
    return d;
  }
  private money(row: Row, key: string): number {
    const raw = this.cell(row, key);
    const n = parseMoney(raw, this.s.currency);
    if (n === null) throw new RowFail(`Unrecognised amount "${raw}"`);
    if (n < 0) throw new RowFail(`Negative amount "${raw}" skipped`);
    if (n === 0) throw new RowFail('Amount must be greater than zero');
    return n;
  }
  private customFields(row: Row): CustomFields {
    const out: CustomFields = {};
    for (const d of this.defs) {
      const v = this.cell(row, `cf:${d.key}`);
      if (v !== '') out[d.key] = v;
    }
    return out;
  }
  private validate<T>(schema: ZodType<T>, value: unknown): T {
    try {
      return schema.parse(value);
    } catch (e) {
      if (e instanceof ZodError) throw new RowFail(e.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; '));
      throw e;
    }
  }

  // ─── Name resolution ────────────────────────────────────────────────────────

  private async category(row: Row, kind: CategoryKind, required: boolean): Promise<string | null> {
    const name = this.cell(row, 'category');
    if (!name) {
      if (required) throw new RowFail('Category is missing');
      return null;
    }
    const key = `${kind}:${name.toLowerCase()}`;
    let cat = this.categoryCache.get(key) ?? (await this.s.svc.categories.findByName(kind, name));
    if (!cat) {
      if (!this.options.createMissingCategories) throw new RowFail(`Unknown ${kind} category "${name}"`);
      cat = await this.s.svc.categories.create({ name, kind }, this.actor, { audit: false });
      this.createdCategories++;
    }
    this.categoryCache.set(key, cat);
    return cat.id;
  }

  private async stakeholder(row: Row, key: string, required: boolean): Promise<string | null> {
    const name = this.cell(row, key);
    if (!name) {
      if (required) throw new RowFail(`${key} is missing`);
      return null;
    }
    const k = name.toLowerCase();
    let sh = this.stakeholderCache.get(k) ?? (await this.s.svc.stakeholders.findByName(name));
    if (!sh) {
      if (!this.options.createMissingStakeholders) throw new RowFail(`Unknown stakeholder "${name}"`);
      sh = await this.s.svc.stakeholders.create({ name, sharePercent: 0, active: true }, this.actor, { audit: false });
      this.createdStakeholders++;
    }
    this.stakeholderCache.set(k, sh);
    return sh.id;
  }

  // ─── Generic pipeline ───────────────────────────────────────────────────────

  private async prepare<T>(build: (row: Row, line: number) => Promise<Prepared<T>>): Promise<Prepared<T>[]> {
    const out: Prepared<T>[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      const line = i + 2; // spreadsheet line number (header is line 1)
      try {
        out.push(await build(this.rows[i], line));
      } catch (e) {
        this.errors.push({ row: line, message: messageOf(e) });
      }
    }
    return out;
  }

  private async insert<T>(prepared: Prepared<T>[], existing: Set<string>, create: (input: T, db: Db) => Promise<unknown>): Promise<ImportCommitResponse> {
    const todo: Prepared<T>[] = [];
    for (const p of prepared) {
      if (this.options.skipDuplicates && existing.has(p.dupKey)) {
        this.skipped++;
        continue;
      }
      existing.add(p.dupKey);
      todo.push(p);
    }
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      await this.s.db.$transaction(async (tx) => {
        for (const p of chunk) {
          try {
            await create(p.input, tx);
            this.inserted++;
          } catch (e) {
            this.errors.push({ row: p.line, message: messageOf(e) });
          }
        }
      }, INTERACTIVE_TX);
    }
    this.errors.sort((a, b) => a.row - b.row);
    return { inserted: this.inserted, skipped: this.skipped, errors: this.errors };
  }

  // ─── Entities ───────────────────────────────────────────────────────────────

  async expenses(): Promise<ImportCommitResponse> {
    const prepared = await this.prepare(async (row, line) => {
      const date = this.date(row, 'date', true) as string;
      const amountMinor = this.money(row, 'amount');
      const input = this.validate(createExpenseSchema, {
        date,
        amountMinor,
        description: this.cell(row, 'description'),
        categoryId: await this.category(row, 'expense', true),
        paidByStakeholderId: await this.stakeholder(row, 'paidBy', false),
        vendor: this.opt(row, 'vendor'),
        notes: this.opt(row, 'notes'),
        splitMode: 'ownership',
        customFields: this.customFields(row),
      });
      return { line, input, dupKey: `${date}|${amountMinor}|${input.description.toLowerCase()}` };
    });
    const rows = await this.s.db.expense.findMany({ select: { date: true, amountMinor: true, description: true } });
    const existing = new Set(rows.map((r) => `${r.date}|${r.amountMinor}|${r.description.toLowerCase()}`));
    return this.insert(prepared, existing, (input, db) => this.s.svc.expenses.create(input, this.actor, { db, audit: false, importBatchId: this.batchId }));
  }

  async revenue(): Promise<ImportCommitResponse> {
    const prepared = await this.prepare(async (row, line) => {
      const date = this.date(row, 'date', true) as string;
      const amountMinor = this.money(row, 'amount');
      const input = this.validate(createRevenueSchema, {
        date,
        amountMinor,
        description: this.cell(row, 'description'),
        categoryId: await this.category(row, 'revenue', false),
        source: this.opt(row, 'source'),
        receivedByStakeholderId: await this.stakeholder(row, 'receivedBy', false),
        notes: this.opt(row, 'notes'),
        customFields: this.customFields(row),
      });
      return { line, input, dupKey: `${date}|${amountMinor}|${input.description.toLowerCase()}` };
    });
    const rows = await this.s.db.revenue.findMany({ select: { date: true, amountMinor: true, description: true } });
    const existing = new Set(rows.map((r) => `${r.date}|${r.amountMinor}|${r.description.toLowerCase()}`));
    return this.insert(prepared, existing, (input, db) => this.s.svc.revenue.create(input, this.actor, { db, audit: false, importBatchId: this.batchId }));
  }

  async stakeholders(): Promise<ImportCommitResponse> {
    const prepared = await this.prepare(async (row, line) => {
      const shareRaw = this.cell(row, 'sharePercent').replace('%', '').trim();
      const sharePercent = shareRaw === '' ? 0 : Number(shareRaw);
      if (!Number.isFinite(sharePercent)) throw new RowFail(`Unrecognised share "${shareRaw}"`);
      const input = this.validate(createStakeholderSchema, {
        name: this.cell(row, 'name'),
        sharePercent,
        email: this.opt(row, 'email'),
        joinedAt: this.date(row, 'joinedAt', false),
        notes: this.opt(row, 'notes'),
        active: true,
        customFields: this.customFields(row),
      });
      return { line, input, dupKey: input.name.toLowerCase() };
    });
    const rows = await this.s.db.stakeholder.findMany({ select: { name: true } });
    const existing = new Set(rows.map((r) => r.name.toLowerCase()));
    return this.insert(prepared, existing, (input, db) => this.s.svc.stakeholders.create(input, this.actor, { db, audit: false }));
  }

  async categories(): Promise<ImportCommitResponse> {
    const prepared = await this.prepare(async (row, line) => {
      const kindRaw = this.cell(row, 'kind').toLowerCase();
      const kind = kindRaw === 'expense' || kindRaw === 'revenue' ? kindRaw : null;
      if (!kind) throw new RowFail(`Kind must be "expense" or "revenue", got "${kindRaw}"`);
      const budgetRaw = this.cell(row, 'monthlyBudget');
      let monthlyBudgetMinor: number | null = null;
      if (budgetRaw) {
        const n = parseMoney(budgetRaw, this.s.currency);
        if (n === null || n < 0) throw new RowFail(`Unrecognised budget "${budgetRaw}"`);
        monthlyBudgetMinor = n;
      }
      const color = this.opt(row, 'color');
      const input = this.validate(createCategorySchema, {
        name: this.cell(row, 'name'),
        kind,
        ...(color ? { color } : {}),
        monthlyBudgetMinor: kind === 'expense' ? monthlyBudgetMinor : null,
      });
      return { line, input, dupKey: `${kind}:${input.name.toLowerCase()}` };
    });
    const rows = await this.s.db.category.findMany({ select: { kind: true, name: true } });
    const existing = new Set(rows.map((r) => `${r.kind}:${r.name.toLowerCase()}`));
    return this.insert(prepared, existing, (input, db) => this.s.svc.categories.create(input, this.actor, { db, audit: false }));
  }

  async settlements(): Promise<ImportCommitResponse> {
    const prepared = await this.prepare(async (row, line) => {
      const date = this.date(row, 'date', true) as string;
      const amountMinor = this.money(row, 'amount');
      const from = (await this.stakeholder(row, 'from', true)) as string;
      const to = await this.stakeholder(row, 'to', false);
      const input = this.validate(createSettlementSchema, { date, fromStakeholderId: from, toStakeholderId: to, amountMinor, note: this.opt(row, 'notes') });
      return { line, input, dupKey: `${date}|${amountMinor}|${from}|${to ?? ''}` };
    });
    const rows = await this.s.db.settlement.findMany({ select: { date: true, amountMinor: true, fromStakeholderId: true, toStakeholderId: true } });
    const existing = new Set(rows.map((r) => `${r.date}|${r.amountMinor}|${r.fromStakeholderId}|${r.toStakeholderId ?? ''}`));
    return this.insert(prepared, existing, (input, db) => this.s.svc.settlements.create(input, this.actor, { db, audit: false }));
  }
}

class RowFail extends Error {}

function messageOf(e: unknown): string {
  if (e instanceof RowFail) return e.message;
  if (e instanceof ApiException) {
    const r = e.getResponse() as { message?: string; details?: unknown };
    const details = Array.isArray(r.details) ? r.details.map((d) => (typeof d === 'object' && d && 'message' in d ? String((d as { message: unknown }).message) : String(d))).join('; ') : '';
    return details ? `${r.message ?? e.message}: ${details}` : r.message ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Render any exceljs cell value as the text the CSV path would have seen. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink;
  }
  return String(v);
}
