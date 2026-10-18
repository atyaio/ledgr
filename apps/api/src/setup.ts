import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { pickColor, type CustomFieldEntity, type CustomFieldType } from '@atyaio/ledgr-shared';
import { PrismaClient } from './generated/prisma/client';
import { LedgrContext } from './common/config/ledgr-config';
import { runMigrations } from './common/prisma/migrator';

export interface InitialSetup {
  stakeholders: { name: string; sharePercent: number; email?: string | null }[];
  expenseCategories: string[];
  revenueCategories: string[];
  customFields: { entity: CustomFieldEntity; label: string; key: string; type: CustomFieldType; options?: string[]; required?: boolean }[];
}

/** Used by `ledgr init`: applies migrations and inserts the starting records without booting Nest. */
export async function applyInitialSetup(ctx: LedgrContext, setup: InitialSetup): Promise<{ stakeholders: number; categories: number; customFields: number }> {
  runMigrations(ctx.paths.dbPath);
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: ctx.paths.dbPath }) });
  try {
    let n = 0;
    for (const [i, s] of setup.stakeholders.entries()) {
      await prisma.stakeholder.create({ data: { name: s.name, sharePercent: s.sharePercent, email: s.email ?? null, color: pickColor(i) } });
      n++;
    }
    let c = 0;
    for (const [i, name] of setup.expenseCategories.entries()) {
      await prisma.category.upsert({ where: { kind_name: { kind: 'expense', name } }, update: {}, create: { kind: 'expense', name, color: pickColor(i), sortOrder: i } });
      c++;
    }
    for (const [i, name] of setup.revenueCategories.entries()) {
      await prisma.category.upsert({ where: { kind_name: { kind: 'revenue', name } }, update: {}, create: { kind: 'revenue', name, color: pickColor(i), sortOrder: i } });
      c++;
    }
    let f = 0;
    for (const [i, cf] of setup.customFields.entries()) {
      await prisma.customFieldDefinition.upsert({
        where: { entity_key: { entity: cf.entity, key: cf.key } },
        update: {},
        create: { entity: cf.entity, key: cf.key, label: cf.label, type: cf.type, options: JSON.stringify(cf.options ?? []), required: cf.required ?? false, sortOrder: i },
      });
      f++;
    }
    return { stakeholders: n, categories: c, customFields: f };
  } finally {
    await prisma.$disconnect();
  }
}

export async function dbCounts(ctx: LedgrContext): Promise<{ stakeholders: number; categories: number; expenses: number; revenue: number }> {
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: ctx.paths.dbPath }) });
  try {
    const [stakeholders, categories, expenses, revenue] = await Promise.all([prisma.stakeholder.count(), prisma.category.count(), prisma.expense.count(), prisma.revenue.count()]);
    return { stakeholders, categories, expenses, revenue };
  } finally {
    await prisma.$disconnect();
  }
}
