import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditLogEntry, Paginated } from '@ledgr/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user.decorator';
import { parseJson } from '../json';

export interface AuditInput {
  actor: CurrentUser;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? null : JSON.stringify(input.before),
        after: input.after === undefined ? null : JSON.stringify(input.after),
      },
    });
  }

  async list(q: { entity?: string; entityId?: string; action?: string; page: number; pageSize: number }): Promise<Paginated<AuditLogEntry>> {
    const where = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        actorId: r.actorId,
        actorEmail: r.actorEmail,
        action: r.action as AuditAction,
        entity: r.entity,
        entityId: r.entityId,
        before: parseJson<unknown>(r.before, null),
        after: parseJson<unknown>(r.after, null),
      })),
    };
  }
}
