import { z } from 'zod';
import {
  CATEGORY_KINDS,
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  GRANULARITIES,
  IMPORT_ENTITIES,
  RECURRING_FREQUENCIES,
  SPLIT_MODES,
} from './types';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb');
export const minorAmount = z.number().int('Amounts are integer minor units');
export const positiveMinor = minorAmount.positive('Amount must be greater than zero');
export const percent = z.number().min(0).max(100);
export const slugKey = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and underscores; start with a letter');

export const customFieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
/** Query-string boolean: only "true" / "1" / "yes" are true (z.coerce.boolean would make "false" true). */
export const queryBool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['true', '1', 'yes'].includes(v.toLowerCase())))
  .optional();
export const customFields = z.record(z.string(), customFieldValue).default({});

// ─── Shared list query ─────────────────────────────────────────────────────────
export const listQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(200).optional(),
  categoryId: z.string().optional(),
  stakeholderId: z.string().optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListQuery = z.infer<typeof listQuery>;

export const rangeQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export type RangeQuery = z.infer<typeof rangeQuery>;

// ─── Project ───────────────────────────────────────────────────────────────────
export const projectConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
  locale: z.string().trim().min(2).max(20),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  port: z.number().int().min(1).max(65535),
  auth: z.object({
    mode: z.enum(['supabase', 'none']),
    supabaseUrl: z.string().url().optional(),
    supabaseAnonKey: z.string().min(10).optional(),
  }),
});
export const updateProjectSchema = projectConfigSchema
  .pick({ name: true, currency: true, locale: true, weekStartsOn: true, fiscalYearStartMonth: true })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ─── Stakeholders ──────────────────────────────────────────────────────────────
export const createStakeholderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().nullable().optional(),
  sharePercent: percent,
  active: z.boolean().default(true),
  joinedAt: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  color: hexColor.optional(),
  customFields: customFields.optional(),
});
export const updateStakeholderSchema = createStakeholderSchema.partial();
export type CreateStakeholderInput = z.infer<typeof createStakeholderSchema>;
export type UpdateStakeholderInput = z.infer<typeof updateStakeholderSchema>;

// ─── Categories ────────────────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(CATEGORY_KINDS),
  color: hexColor.optional(),
  monthlyBudgetMinor: minorAmount.min(0).nullable().optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateCategorySchema = createCategorySchema.omit({ kind: true }).partial();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export const categoryListQuery = z.object({
  kind: z.enum(CATEGORY_KINDS).optional(),
  includeArchived: queryBool,
});
export const budgetsQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

// ─── Expenses ──────────────────────────────────────────────────────────────────
export const customSplitSchema = z.object({
  stakeholderId: z.string().min(1),
  sharePercent: percent,
});
export const createExpenseSchema = z.object({
  date: isoDate,
  amountMinor: positiveMinor,
  description: z.string().trim().min(1).max(200),
  categoryId: z.string().min(1),
  paidByStakeholderId: z.string().nullable().optional(),
  vendor: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  splitMode: z.enum(SPLIT_MODES).default('ownership'),
  /** Required when splitMode = custom. Percentages must sum to 100 (±0.01). */
  customSplits: z.array(customSplitSchema).optional(),
  customFields: customFields.optional(),
});
export const updateExpenseSchema = createExpenseSchema.partial();
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export const bulkIdsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) });

// ─── Revenue ───────────────────────────────────────────────────────────────────
export const createRevenueSchema = z.object({
  date: isoDate,
  amountMinor: positiveMinor,
  description: z.string().trim().min(1).max(200),
  categoryId: z.string().nullable().optional(),
  source: z.string().trim().max(120).nullable().optional(),
  receivedByStakeholderId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  customFields: customFields.optional(),
});
export const updateRevenueSchema = createRevenueSchema.partial();
export type CreateRevenueInput = z.infer<typeof createRevenueSchema>;
export type UpdateRevenueInput = z.infer<typeof updateRevenueSchema>;

// ─── Settlements ───────────────────────────────────────────────────────────────
export const createSettlementSchema = z.object({
  date: isoDate,
  fromStakeholderId: z.string().min(1),
  toStakeholderId: z.string().nullable().optional(), // null/undefined = pool
  amountMinor: positiveMinor,
  note: z.string().max(500).nullable().optional(),
});
export const updateSettlementSchema = createSettlementSchema.partial();
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type UpdateSettlementInput = z.infer<typeof updateSettlementSchema>;

// ─── Custom fields ─────────────────────────────────────────────────────────────
export const createCustomFieldSchema = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES),
  key: slugKey,
  label: z.string().trim().min(1).max(60),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(60)).max(100).default([]),
  required: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
});
export const updateCustomFieldSchema = createCustomFieldSchema.omit({ entity: true, key: true }).partial().extend({
  archived: z.boolean().optional(),
});
export const reorderSchema = z.object({ ids: z.array(z.string().min(1)) });
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
export const customFieldListQuery = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES).optional(),
  includeArchived: queryBool,
});

// ─── Recurring ─────────────────────────────────────────────────────────────────
export const recurringTemplateSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amountMinor: positiveMinor,
  categoryId: z.string().nullable().default(null),
  partyStakeholderId: z.string().nullable().default(null),
  vendorOrSource: z.string().trim().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  splitMode: z.enum(SPLIT_MODES).default('ownership'),
  customSplits: z.array(customSplitSchema).default([]),
  customFields: customFields,
});
export const createRecurringSchema = z.object({
  kind: z.enum(CATEGORY_KINDS),
  name: z.string().trim().min(1).max(80),
  frequency: z.enum(RECURRING_FREQUENCIES),
  interval: z.number().int().min(1).max(365).default(1),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  active: z.boolean().default(true),
  template: recurringTemplateSchema,
});
export const updateRecurringSchema = createRecurringSchema.omit({ kind: true }).partial();
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsQuery = z.object({
  from: isoDate,
  to: isoDate,
  granularity: z.enum(GRANULARITIES).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuery>;

// ─── Import / export ───────────────────────────────────────────────────────────
export const importEntitySchema = z.enum(IMPORT_ENTITIES);
export const importOptionsSchema = z.object({
  dateFormat: z.enum(['auto', 'iso', 'dmy', 'mdy']).default('auto'),
  createMissingCategories: z.boolean().default(true),
  createMissingStakeholders: z.boolean().default(false),
  skipDuplicates: z.boolean().default(true),
});
export const importCommitSchema = z.object({
  mapping: z.record(z.string(), z.string().nullable()),
  options: importOptionsSchema.default({
    dateFormat: 'auto',
    createMissingCategories: true,
    createMissingStakeholders: false,
    skipDuplicates: true,
  }),
});
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export const auditQuery = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
