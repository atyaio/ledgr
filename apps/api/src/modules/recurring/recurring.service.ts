import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  nextOccurrence,
  todayISO,
  validCustomSplit,
  type CategoryKind,
  type CreateRecurringInput,
  type RecurringFrequency,
  type RecurringRule,
  type RecurringRunResponse,
  type RecurringTemplate,
  type UpdateRecurringInput,
} from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { toIso } from '../../common/db';
import { badRequest, notFound } from '../../common/errors';
import { parseJson } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RecurringRule as Row } from '../../generated/prisma/client';
import { CategoriesService } from '../categories/categories.service';
import { ExpensesService } from '../expenses/expenses.service';
import { RevenueService } from '../revenue/revenue.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';

const EMPTY_TEMPLATE: RecurringTemplate = {
  description: '',
  amountMinor: 0,
  categoryId: null,
  partyStakeholderId: null,
  vendorOrSource: null,
  notes: null,
  splitMode: 'ownership',
  customSplits: [],
  customFields: {},
};

export function toRecurringDto(r: Row): RecurringRule {
  return {
    id: r.id,
    kind: r.kind as CategoryKind,
    name: r.name,
    frequency: r.frequency as RecurringFrequency,
    interval: r.interval,
    startDate: r.startDate,
    endDate: r.endDate,
    nextRunAt: r.nextRunAt,
    active: r.active,
    template: { ...EMPTY_TEMPLATE, ...parseJson<Partial<RecurringTemplate>>(r.template, {}) },
    lastGeneratedAt: r.lastGeneratedAt,
    generatedCount: r.generatedCount,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

export const SCHEDULER_ACTOR: CurrentUser = { id: 'scheduler', email: 'scheduler@ledgr', role: 'admin' };
const MAX_OCCURRENCES_PER_RUN = 1000;

@Injectable()
export class RecurringService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Recurring');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: CategoriesService,
    private readonly stakeholders: StakeholdersService,
    private readonly expenses: ExpensesService,
    private readonly revenue: RevenueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runSafely('startup');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly(): Promise<void> {
    await this.runSafely('hourly');
  }

  private async runSafely(reason: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const res = await this.run(SCHEDULER_ACTOR);
      if (res.generated.length) this.logger.log(`Generated ${res.generated.length} recurring entr${res.generated.length === 1 ? 'y' : 'ies'} (${reason})`);
    } catch (err) {
      this.logger.error(`Recurring run failed (${reason}): ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async list(): Promise<RecurringRule[]> {
    const rows = await this.prisma.recurringRule.findMany({ orderBy: [{ active: 'desc' }, { nextRunAt: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(toRecurringDto);
  }

  async get(id: string): Promise<RecurringRule> {
    const row = await this.prisma.recurringRule.findUnique({ where: { id } });
    if (!row) throw notFound('Recurring rule', id);
    return toRecurringDto(row);
  }

  private async validateTemplate(kind: CategoryKind, t: RecurringTemplate): Promise<void> {
    if (kind === 'expense') {
      if (!t.categoryId) throw badRequest('CATEGORY_REQUIRED', 'Recurring expenses need a category');
      await this.categories.requireKind(t.categoryId, 'expense');
      if (t.splitMode === 'custom' && !validCustomSplit(t.customSplits)) {
        throw badRequest('INVALID_SPLIT', 'Custom splits must list each stakeholder once and total 100%', t.customSplits);
      }
    } else if (t.categoryId) {
      await this.categories.requireKind(t.categoryId, 'revenue');
    }
    if (t.partyStakeholderId) await this.stakeholders.get(t.partyStakeholderId);
  }

  async create(input: CreateRecurringInput, actor: CurrentUser): Promise<RecurringRule> {
    await this.validateTemplate(input.kind, input.template);
    if (input.endDate && input.endDate < input.startDate) throw badRequest('INVALID_RANGE', 'endDate must be on or after startDate');
    const row = await this.prisma.recurringRule.create({
      data: {
        kind: input.kind,
        name: input.name,
        frequency: input.frequency,
        interval: input.interval,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextRunAt: input.startDate,
        active: input.active,
        template: JSON.stringify(input.template),
      },
    });
    const dto = toRecurringDto(row);
    await this.audit.log({ actor, action: 'create', entity: 'recurringRule', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateRecurringInput, actor: CurrentUser): Promise<RecurringRule> {
    const before = await this.get(id);
    const template = input.template ?? before.template;
    if (input.template) await this.validateTemplate(before.kind, template);
    const startDate = input.startDate ?? before.startDate;
    const endDate = input.endDate === undefined ? before.endDate : input.endDate;
    const frequency = input.frequency ?? before.frequency;
    const interval = input.interval ?? before.interval;
    if (endDate && endDate < startDate) throw badRequest('INVALID_RANGE', 'endDate must be on or after startDate');

    let nextRunAt = before.nextRunAt;
    if (input.startDate !== undefined && input.startDate !== before.startDate) {
      nextRunAt = before.lastGeneratedAt && before.lastGeneratedAt >= startDate ? nextOccurrence(before.lastGeneratedAt, frequency, interval) : startDate;
    } else if ((input.frequency !== undefined && input.frequency !== before.frequency) || (input.interval !== undefined && input.interval !== before.interval)) {
      nextRunAt = before.lastGeneratedAt ? nextOccurrence(before.lastGeneratedAt, frequency, interval) : startDate;
    }

    const row = await this.prisma.recurringRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        frequency,
        interval,
        startDate,
        endDate,
        nextRunAt,
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.template !== undefined ? { template: JSON.stringify(template) } : {}),
      },
    });
    const after = toRecurringDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'recurringRule', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    await this.prisma.recurringRule.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'recurringRule', entityId: id, before });
  }

  // ─── Generation ─────────────────────────────────────────────────────────────

  /** Generate every due occurrence (nextRunAt <= today) for all active rules, or one rule. */
  async run(actor: CurrentUser, ruleId?: string): Promise<RecurringRunResponse> {
    const today = todayISO();
    if (ruleId) await this.get(ruleId);
    const rules = await this.prisma.recurringRule.findMany({
      where: { active: true, nextRunAt: { lte: today }, ...(ruleId ? { id: ruleId } : {}) },
      orderBy: { nextRunAt: 'asc' },
    });
    const generated: RecurringRunResponse['generated'] = [];
    for (const row of rules) {
      const rule = toRecurringDto(row);
      const mine: RecurringRunResponse['generated'] = [];
      let next = rule.nextRunAt;
      let guard = 0;
      while (next <= today && (!rule.endDate || next <= rule.endDate) && guard++ < MAX_OCCURRENCES_PER_RUN) {
        const entryId = await this.generateOne(rule, next, actor);
        mine.push({ ruleId: rule.id, kind: rule.kind, entryId, date: next });
        next = nextOccurrence(next, rule.frequency, rule.interval);
      }
      const finished = !!rule.endDate && next > rule.endDate;
      await this.prisma.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunAt: next,
          ...(mine.length ? { lastGeneratedAt: mine[mine.length - 1].date, generatedCount: { increment: mine.length } } : {}),
          ...(finished ? { active: false } : {}),
        },
      });
      if (mine.length) {
        await this.audit.log({ actor, action: 'generate', entity: 'recurringRule', entityId: rule.id, after: { generated: mine, nextRunAt: next, finished } });
      }
      generated.push(...mine);
    }
    return { generated };
  }

  private async generateOne(rule: RecurringRule, date: string, actor: CurrentUser): Promise<string> {
    const t = rule.template;
    if (rule.kind === 'expense') {
      const e = await this.expenses.create(
        {
          date,
          amountMinor: t.amountMinor,
          description: t.description,
          categoryId: t.categoryId ?? '',
          paidByStakeholderId: t.partyStakeholderId,
          vendor: t.vendorOrSource,
          notes: t.notes,
          splitMode: t.splitMode,
          customSplits: t.splitMode === 'custom' ? t.customSplits : undefined,
          customFields: t.customFields,
        },
        actor,
        { recurringRuleId: rule.id },
      );
      return e.id;
    }
    const r = await this.revenue.create(
      {
        date,
        amountMinor: t.amountMinor,
        description: t.description,
        categoryId: t.categoryId,
        source: t.vendorOrSource,
        paymentMethodId: t.paymentMethodId ?? null,
        receivedByStakeholderId: t.partyStakeholderId,
        notes: t.notes,
        customFields: t.customFields,
      },
      actor,
      { recurringRuleId: rule.id },
    );
    return r.id;
  }
}
