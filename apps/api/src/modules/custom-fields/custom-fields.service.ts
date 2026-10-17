import { Injectable } from '@nestjs/common';
import {
  normalizeCustomFields,
  type CreateCustomFieldInput,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFieldType,
  type CustomFields,
  type UpdateCustomFieldInput,
} from '@ledgr/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { CurrentUser } from '../../common/auth/current-user.decorator';
import { LedgrContext } from '../../common/config/ledgr-config';
import type { Db } from '../../common/db';
import { toIso } from '../../common/db';
import { badRequest, conflict, notFound } from '../../common/errors';
import { parseStringArray } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CustomFieldDefinition as Row } from '../../generated/prisma/client';

export function toCustomFieldDto(r: Row): CustomFieldDefinition {
  return {
    id: r.id,
    entity: r.entity as CustomFieldEntity,
    key: r.key,
    label: r.label,
    type: r.type as CustomFieldType,
    options: parseStringArray(r.options),
    required: r.required,
    sortOrder: r.sortOrder,
    archived: r.archived,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ctx: LedgrContext,
  ) {}

  async list(q: { entity?: CustomFieldEntity; includeArchived?: boolean }): Promise<CustomFieldDefinition[]> {
    const rows = await this.prisma.customFieldDefinition.findMany({
      where: { ...(q.entity ? { entity: q.entity } : {}), ...(q.includeArchived ? {} : { archived: false }) },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toCustomFieldDto);
  }

  /** Active definitions for an entity (used for validation and CSV columns). */
  async definitions(entity: CustomFieldEntity, db: Db = this.prisma): Promise<CustomFieldDefinition[]> {
    const rows = await db.customFieldDefinition.findMany({
      where: { entity, archived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toCustomFieldDto);
  }

  /**
   * Coerce + validate a customFields payload against the entity's definitions.
   * Throws 400 CUSTOM_FIELDS with the issues when invalid.
   */
  async normalize(entity: CustomFieldEntity, input: CustomFields | undefined, db: Db = this.prisma): Promise<CustomFields> {
    const defs = await this.definitions(entity, db);
    return this.normalizeWith(defs, input);
  }

  normalizeWith(defs: CustomFieldDefinition[], input: CustomFields | undefined): CustomFields {
    const { values, issues } = normalizeCustomFields(input, defs, this.ctx.currency);
    if (issues.length) throw badRequest('CUSTOM_FIELDS', 'Invalid custom field values', issues);
    return values;
  }

  async get(id: string): Promise<CustomFieldDefinition> {
    const row = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!row) throw notFound('Custom field', id);
    return toCustomFieldDto(row);
  }

  async create(input: CreateCustomFieldInput, actor: CurrentUser): Promise<CustomFieldDefinition> {
    const dup = await this.prisma.customFieldDefinition.findUnique({ where: { entity_key: { entity: input.entity, key: input.key } } });
    if (dup) throw conflict('DUPLICATE_KEY', `A ${input.entity} field with key "${input.key}" already exists`);
    if (input.type === 'select' && input.options.length === 0) throw badRequest('OPTIONS_REQUIRED', 'Select fields need at least one option');
    const sortOrder = input.sortOrder ?? (await this.prisma.customFieldDefinition.count({ where: { entity: input.entity } }));
    const row = await this.prisma.customFieldDefinition.create({
      data: {
        entity: input.entity,
        key: input.key,
        label: input.label,
        type: input.type,
        options: JSON.stringify(input.options),
        required: input.required,
        sortOrder,
      },
    });
    const dto = toCustomFieldDto(row);
    await this.audit.log({ actor, action: 'create', entity: 'customField', entityId: dto.id, after: dto });
    return dto;
  }

  async update(id: string, input: UpdateCustomFieldInput, actor: CurrentUser): Promise<CustomFieldDefinition> {
    const before = await this.get(id);
    const type = input.type ?? before.type;
    const options = input.options ?? before.options;
    if (type === 'select' && options.length === 0) throw badRequest('OPTIONS_REQUIRED', 'Select fields need at least one option');
    const row = await this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.options !== undefined ? { options: JSON.stringify(input.options) } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
      },
    });
    const after = toCustomFieldDto(row);
    await this.audit.log({ actor, action: 'update', entity: 'customField', entityId: id, before, after });
    return after;
  }

  async remove(id: string, actor: CurrentUser): Promise<void> {
    const before = await this.get(id);
    await this.prisma.customFieldDefinition.delete({ where: { id } });
    await this.audit.log({ actor, action: 'delete', entity: 'customField', entityId: id, before });
  }

  async reorder(ids: string[], actor: CurrentUser): Promise<CustomFieldDefinition[]> {
    const rows = await this.prisma.customFieldDefinition.findMany({ where: { id: { in: ids } } });
    const known = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw badRequest('UNKNOWN_IDS', 'Some custom field ids do not exist', missing);
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.customFieldDefinition.update({ where: { id }, data: { sortOrder: i } })));
    await this.audit.log({ actor, action: 'update', entity: 'customField', entityId: null, after: { reorder: ids } });
    const updated = await this.prisma.customFieldDefinition.findMany({ where: { id: { in: ids } }, orderBy: { sortOrder: 'asc' } });
    return updated.map(toCustomFieldDto);
  }
}
