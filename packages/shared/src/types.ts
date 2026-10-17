// ─── Core enums ────────────────────────────────────────────────────────────────
export const CATEGORY_KINDS = ['expense', 'revenue'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const SPLIT_MODES = ['ownership', 'custom'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const CUSTOM_FIELD_ENTITIES = ['expense', 'revenue', 'stakeholder'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'money', 'date', 'boolean', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'import', 'settle', 'recompute', 'generate', 'restore'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const IMPORT_ENTITIES = ['expenses', 'revenue', 'stakeholders', 'categories', 'settlements'] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Virtual party for money paid from / received by the company itself. */
export const POOL_ID = 'pool';

/** JSON-compatible custom field value. */
export type CustomFieldValue = string | number | boolean | null;
export type CustomFields = Record<string, CustomFieldValue>;

// ─── Config ────────────────────────────────────────────────────────────────────
export type AuthMode = 'supabase' | 'none';

export interface ProjectConfig {
  name: string;
  slug: string;
  currency: string;
  locale: string;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  fiscalYearStartMonth: number;
  port: number;
  auth: {
    mode: AuthMode;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}

export interface AuthConfigResponse {
  mode: AuthMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface MeResponse {
  id: string;
  email: string;
  role: 'admin';
}

export interface ProjectResponse {
  config: Omit<ProjectConfig, 'auth'> & { auth: { mode: AuthMode } };
  stats: {
    stakeholders: number;
    expenses: number;
    revenue: number;
    firstEntryDate: string | null;
    lastEntryDate: string | null;
    shareTotal: number;
  };
  version: string;
}

// ─── Entities ──────────────────────────────────────────────────────────────────
export interface Stakeholder {
  id: string;
  name: string;
  email: string | null;
  sharePercent: number;
  active: boolean;
  joinedAt: string | null;
  notes: string | null;
  color: string;
  customFields: CustomFields;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  monthlyBudgetMinor: number | null;
  /** Preselected in the new-entry form; at most one per kind. */
  isDefault: boolean;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  stakeholderId: string;
  stakeholderName?: string;
  sharePercent: number;
  amountMinor: number;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amountMinor: number;
  description: string;
  categoryId: string;
  category?: Pick<Category, 'id' | 'name' | 'color'>;
  paidByStakeholderId: string | null;
  paidBy?: Pick<Stakeholder, 'id' | 'name' | 'color'> | null;
  vendor: string | null;
  notes: string | null;
  splitMode: SplitMode;
  splits: ExpenseSplit[];
  recurringRuleId: string | null;
  customFields: CustomFields;
  createdAt: string;
  updatedAt: string;
}

export interface Revenue {
  id: string;
  date: string;
  amountMinor: number;
  description: string;
  categoryId: string | null;
  category?: Pick<Category, 'id' | 'name' | 'color'> | null;
  source: string | null;
  receivedByStakeholderId: string | null;
  receivedBy?: Pick<Stakeholder, 'id' | 'name' | 'color'> | null;
  notes: string | null;
  recurringRuleId: string | null;
  customFields: CustomFields;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  date: string;
  fromStakeholderId: string;
  from?: Pick<Stakeholder, 'id' | 'name' | 'color'>;
  toStakeholderId: string | null; // null = pool
  to?: Pick<Stakeholder, 'id' | 'name' | 'color'> | null;
  amountMinor: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTemplate {
  description: string;
  amountMinor: number;
  categoryId: string | null;
  partyStakeholderId: string | null; // paidBy for expenses, receivedBy for revenue
  vendorOrSource: string | null;
  notes: string | null;
  splitMode: SplitMode;
  customSplits: { stakeholderId: string; sharePercent: number }[];
  customFields: CustomFields;
}

export interface RecurringRule {
  id: string;
  kind: CategoryKind;
  name: string;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  nextRunAt: string;
  active: boolean;
  template: RecurringTemplate;
  lastGeneratedAt: string | null;
  generatedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  before: unknown | null;
  after: unknown | null;
}

// ─── Lists & common responses ──────────────────────────────────────────────────
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTotals {
  amountMinor: number;
  count: number;
}

export interface ExpenseListResponse extends Paginated<Expense> {
  totals: ListTotals;
}
export interface RevenueListResponse extends Paginated<Revenue> {
  totals: ListTotals;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

// ─── Balances & distribution ───────────────────────────────────────────────────
export interface StakeholderBalance {
  stakeholderId: string; // or POOL_ID
  name: string;
  color: string;
  sharePercent: number;
  owedMinor: number;
  paidMinor: number;
  settledOutMinor: number;
  settledInMinor: number;
  netMinor: number; // paid − owed + settledOut − settledIn
}

export interface SuggestedTransfer {
  fromStakeholderId: string;
  fromName: string;
  toStakeholderId: string; // may be POOL_ID
  toName: string;
  amountMinor: number;
}

export interface BalancesResponse {
  range: { from: string | null; to: string | null };
  totalExpenseMinor: number;
  poolPaidMinor: number;
  balances: StakeholderBalance[];
  suggestions: SuggestedTransfer[];
}

export interface StakeholderDistribution {
  stakeholderId: string;
  name: string;
  color: string;
  sharePercent: number;
  revenueShareMinor: number;
  expenseShareMinor: number;
  profitShareMinor: number;
}

export interface DistributionResponse {
  range: { from: string | null; to: string | null };
  revenueMinor: number;
  expenseMinor: number;
  profitMinor: number;
  shareTotal: number;
  items: StakeholderDistribution[];
}

export interface BudgetStatus {
  categoryId: string;
  name: string;
  color: string;
  budgetMinor: number;
  spentMinor: number;
  pct: number; // 0..∞ (100 = on budget)
  remainingMinor: number;
}

// ─── Analytics ─────────────────────────────────────────────────────────────────
export interface AnalyticsOverview {
  range: { from: string; to: string; granularity: Granularity; previousFrom: string; previousTo: string };
  totals: {
    revenueMinor: number;
    expenseMinor: number;
    netMinor: number;
    marginPct: number | null;
    expenseCount: number;
    revenueCount: number;
  };
  previous: { revenueMinor: number; expenseMinor: number; netMinor: number };
  delta: { revenuePct: number | null; expensePct: number | null; netPct: number | null };
  series: { bucket: string; revenueMinor: number; expenseMinor: number; netMinor: number; cumulativeNetMinor: number }[];
  expensesByCategory: { categoryId: string; name: string; color: string; amountMinor: number; pct: number; count: number }[];
  revenueByCategory: { categoryId: string | null; name: string; color: string; amountMinor: number; pct: number; count: number }[];
  topExpenses: { id: string; date: string; description: string; amountMinor: number; categoryName: string; categoryColor: string }[];
  stakeholders: {
    id: string;
    name: string;
    color: string;
    sharePercent: number;
    owedMinor: number;
    paidMinor: number;
    netMinor: number;
    revenueShareMinor: number;
    profitShareMinor: number;
  }[];
  budgets: BudgetStatus[];
  pool: { revenueMinor: number; expenseMinor: number; netMinor: number };
}

// ─── Import / export ───────────────────────────────────────────────────────────
export interface ImportColumn {
  key: string; // target field key, e.g. "date", "amount", "cf:client"
  label: string;
  required: boolean;
  description?: string;
}

export interface ImportPreviewResponse {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  targets: ImportColumn[];
  suggestedMapping: Record<string, string | null>; // target key → source header
  detectedDateFormat: ImportDateFormat;
}

export type ImportDateFormat = 'auto' | 'iso' | 'dmy' | 'mdy';

export interface ImportOptions {
  dateFormat: ImportDateFormat;
  createMissingCategories: boolean;
  createMissingStakeholders: boolean;
  skipDuplicates: boolean;
}

export interface ImportCommitResponse {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  config: Omit<ProjectConfig, 'auth'>;
  stakeholders: Stakeholder[];
  categories: Category[];
  customFields: CustomFieldDefinition[];
  expenses: Expense[];
  revenue: Revenue[];
  settlements: Settlement[];
  recurring: RecurringRule[];
}

export interface RecurringRunResponse {
  generated: { ruleId: string; kind: CategoryKind; entryId: string; date: string }[];
}
