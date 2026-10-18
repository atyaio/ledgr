import { Injectable } from '@nestjs/common';
import { LEDGR_VERSION, shareTotal, type ProjectResponse, type UpdateProjectInput } from '@atyaio/ledgr-shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { LedgrContext } from '../../common/config/ledgr-config';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: LedgrContext,
    private readonly audit: AuditService,
  ) {}

  publicConfig(): ProjectResponse['config'] {
    const { auth, ...rest } = this.ctx.config;
    return { ...rest, auth: { mode: auth.mode } };
  }

  async get(): Promise<ProjectResponse> {
    const [stakeholders, expenses, revenue, expMin, expMax, revMin, revMax] = await Promise.all([
      this.prisma.stakeholder.findMany({ where: { active: true }, select: { sharePercent: true } }),
      this.prisma.expense.count(),
      this.prisma.revenue.count(),
      this.prisma.expense.aggregate({ _min: { date: true } }),
      this.prisma.expense.aggregate({ _max: { date: true } }),
      this.prisma.revenue.aggregate({ _min: { date: true } }),
      this.prisma.revenue.aggregate({ _max: { date: true } }),
    ]);
    const mins = [expMin._min.date, revMin._min.date].filter((d): d is string => !!d).sort();
    const maxs = [expMax._max.date, revMax._max.date].filter((d): d is string => !!d).sort();
    return {
      config: this.publicConfig(),
      stats: {
        stakeholders: stakeholders.length,
        expenses,
        revenue,
        firstEntryDate: mins[0] ?? null,
        lastEntryDate: maxs[maxs.length - 1] ?? null,
        shareTotal: shareTotal(stakeholders),
      },
      version: LEDGR_VERSION,
    };
  }

  async update(patch: UpdateProjectInput, actor: CurrentUser): Promise<ProjectResponse> {
    const before = this.publicConfig();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as UpdateProjectInput;
    this.ctx.update(clean);
    await this.audit.log({ actor, action: 'update', entity: 'project', entityId: this.ctx.config.slug, before, after: this.publicConfig() });
    return this.get();
  }
}
