import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  AnalyticsOverview,
  InsightsResponse,
  BalancesResponse,
  BudgetStatus,
  Category,
  CreateCategoryInput,
  CreateCustomFieldInput,
  CreateExpenseInput,
  CreateRecurringInput,
  CreateRevenueInput,
  CreateSettlementInput,
  CreateStakeholderInput,
  CustomFieldDefinition,
  DistributionResponse,
  Expense,
  ExpenseListResponse,
  Paginated,
  AuditLogEntry,
  RecurringRule,
  RecurringRunResponse,
  Revenue,
  RevenueListResponse,
  Settlement,
  Stakeholder,
  UpdateCategoryInput,
  UpdateCustomFieldInput,
  UpdateExpenseInput,
  UpdateProjectInput,
  UpdateRecurringInput,
  UpdateRevenueInput,
  UpdateSettlementInput,
  UpdateStakeholderInput,
  ProjectResponse,
  CustomFieldEntity,
  PaymentMethod,
  CreatePaymentMethodInput,
  UpdatePaymentMethodInput,
} from '@ledgr/shared';
import { api, type Query } from './api';

/** Some list endpoints return a bare array; normalise to `{ items }`. */
function items<T>(res: T[] | { items: T[] }): { items: T[] } {
  return Array.isArray(res) ? { items: res } : res;
}

/** Invalidate everything that money changes touch. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['expenses'] }),
      qc.invalidateQueries({ queryKey: ['revenue'] }),
      qc.invalidateQueries({ queryKey: ['analytics'] }),
      qc.invalidateQueries({ queryKey: ['balances'] }),
      qc.invalidateQueries({ queryKey: ['distribution'] }),
      qc.invalidateQueries({ queryKey: ['budgets'] }),
      qc.invalidateQueries({ queryKey: ['settlements'] }),
      qc.invalidateQueries({ queryKey: ['stakeholders'] }),
      qc.invalidateQueries({ queryKey: ['categories'] }),
      qc.invalidateQueries({ queryKey: ['payment-methods'] }),
      qc.invalidateQueries({ queryKey: ['recurring'] }),
      qc.invalidateQueries({ queryKey: ['audit'] }),
      qc.invalidateQueries({ queryKey: ['project'] }),
    ]);
}

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const useOverview = (from: string, to: string) =>
  useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => api.get<AnalyticsOverview>('/analytics/overview', { from, to }),
    placeholderData: keepPreviousData,
  });

export const useInsights = (params: Query) =>
  useQuery({ queryKey: ['analytics', 'insights', params], queryFn: () => api.get<InsightsResponse>('/analytics/insights', params), placeholderData: keepPreviousData });

// ─── Stakeholders ──────────────────────────────────────────────────────────────
export const useStakeholders = () =>
  useQuery({
    queryKey: ['stakeholders'],
    queryFn: () => api.get<Stakeholder[] | { items: Stakeholder[]; shareTotal: number }>('/stakeholders').then((r) => (Array.isArray(r) ? { items: r, shareTotal: r.filter((s) => s.active).reduce((a, s) => a + s.sharePercent, 0) } : r)),
    staleTime: 30_000,
  });
export const useBalances = (from?: string, to?: string) =>
  useQuery({ queryKey: ['balances', from, to], queryFn: () => api.get<BalancesResponse>('/stakeholders/balances', { from, to }), placeholderData: keepPreviousData });
export const useDistribution = (from?: string, to?: string) =>
  useQuery({ queryKey: ['distribution', from, to], queryFn: () => api.get<DistributionResponse>('/stakeholders/distribution', { from, to }), placeholderData: keepPreviousData });

export function useStakeholderMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateStakeholderInput) => api.post<Stakeholder>('/stakeholders', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateStakeholderInput & { id: string }) => api.patch<Stakeholder>(`/stakeholders/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: ({ id, force }: { id: string; force?: boolean }) => api.delete(`/stakeholders/${id}`, { force }), onSuccess: inv }),
  };
}

// ─── Categories ────────────────────────────────────────────────────────────────
export const useCategories = (kind?: 'expense' | 'revenue', includeArchived = false) =>
  useQuery({
    queryKey: ['categories', kind ?? 'all', includeArchived],
    queryFn: () => api.get<Category[] | { items: Category[] }>('/categories', { kind, includeArchived: includeArchived || undefined }).then(items),
    staleTime: 30_000,
  });
export const useBudgets = (month?: string) =>
  useQuery({
    queryKey: ['budgets', month],
    queryFn: () =>
      api.get<BudgetStatus[] | { month?: string; items: BudgetStatus[] }>('/categories/budgets', { month }).then((r) => ({ month: (Array.isArray(r) ? undefined : r.month) ?? month ?? new Date().toISOString().slice(0, 7), items: Array.isArray(r) ? r : r.items })),
  });

export function useCategoryMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateCategoryInput) => api.post<Category>('/categories', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateCategoryInput & { id: string }) => api.patch<Category>(`/categories/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/categories/${id}`), onSuccess: inv }),
  };
}

// ─── Payment methods ───────────────────────────────────────────────────────────
export const usePaymentMethods = (includeArchived = false) =>
  useQuery({
    queryKey: ['payment-methods', includeArchived],
    queryFn: () => api.get<PaymentMethod[] | { items: PaymentMethod[] }>('/payment-methods', { includeArchived: includeArchived || undefined }).then(items),
    staleTime: 30_000,
  });
export function usePaymentMethodMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreatePaymentMethodInput) => api.post<PaymentMethod>('/payment-methods', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdatePaymentMethodInput & { id: string }) => api.patch<PaymentMethod>(`/payment-methods/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/payment-methods/${id}`), onSuccess: inv }),
    reorder: useMutation({ mutationFn: (ids: string[]) => api.post('/payment-methods/reorder', { ids }), onSuccess: inv }),
  };
}

// ─── Expenses / revenue ────────────────────────────────────────────────────────
export const useExpenses = (params: Query) =>
  useQuery({ queryKey: ['expenses', params], queryFn: () => api.get<ExpenseListResponse>('/expenses', params), placeholderData: keepPreviousData });
export const useRevenue = (params: Query) =>
  useQuery({ queryKey: ['revenue', params], queryFn: () => api.get<RevenueListResponse>('/revenue', params), placeholderData: keepPreviousData });

export function useExpenseMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateExpenseInput) => api.post<Expense>('/expenses', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateExpenseInput & { id: string }) => api.patch<Expense>(`/expenses/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/expenses/${id}`), onSuccess: inv }),
    bulkDelete: useMutation({ mutationFn: (ids: string[]) => api.post('/expenses/bulk-delete', { ids }), onSuccess: inv }),
    recompute: useMutation({ mutationFn: (id: string) => api.post<Expense>(`/expenses/${id}/recompute-split`), onSuccess: inv }),
    recomputeRange: useMutation({ mutationFn: (r: { from?: string; to?: string }) => api.post<{ updated: number }>('/expenses/recompute-splits', r), onSuccess: inv }),
    setPayment: useMutation({ mutationFn: ({ id, paymentMethodId, amountMinor }: { id: string; paymentMethodId: string; amountMinor: number }) => api.put<Expense>(`/expenses/${id}/payments/${paymentMethodId}`, { amountMinor }), onSuccess: inv }),
  };
}
export function useRevenueMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateRevenueInput) => api.post<Revenue>('/revenue', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateRevenueInput & { id: string }) => api.patch<Revenue>(`/revenue/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/revenue/${id}`), onSuccess: inv }),
    bulkDelete: useMutation({ mutationFn: (ids: string[]) => api.post('/revenue/bulk-delete', { ids }), onSuccess: inv }),
    setPayment: useMutation({ mutationFn: ({ id, paymentMethodId, amountMinor }: { id: string; paymentMethodId: string; amountMinor: number }) => api.put<Revenue>(`/revenue/${id}/payments/${paymentMethodId}`, { amountMinor }), onSuccess: inv }),
  };
}

// ─── Settlements ───────────────────────────────────────────────────────────────
export const useSettlements = (params: Query) =>
  useQuery({ queryKey: ['settlements', params], queryFn: () => api.get<Paginated<Settlement>>('/settlements', params), placeholderData: keepPreviousData });
export function useSettlementMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateSettlementInput) => api.post<Settlement>('/settlements', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateSettlementInput & { id: string }) => api.patch<Settlement>(`/settlements/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/settlements/${id}`), onSuccess: inv }),
  };
}

// ─── Custom fields ─────────────────────────────────────────────────────────────
export const useCustomFields = (entity?: CustomFieldEntity, includeArchived = false) =>
  useQuery({
    queryKey: ['custom-fields', entity ?? 'all', includeArchived],
    queryFn: () => api.get<CustomFieldDefinition[] | { items: CustomFieldDefinition[] }>('/custom-fields', { entity, includeArchived: includeArchived || undefined }).then(items),
    staleTime: 60_000,
  });
export function useCustomFieldMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ['custom-fields'] });
  return {
    create: useMutation({ mutationFn: (b: CreateCustomFieldInput) => api.post<CustomFieldDefinition>('/custom-fields', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateCustomFieldInput & { id: string }) => api.patch<CustomFieldDefinition>(`/custom-fields/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/custom-fields/${id}`), onSuccess: inv }),
    reorder: useMutation({ mutationFn: (ids: string[]) => api.post('/custom-fields/reorder', { ids }), onSuccess: inv }),
  };
}

// ─── Recurring ─────────────────────────────────────────────────────────────────
export const useRecurring = () => useQuery({ queryKey: ['recurring'], queryFn: () => api.get<RecurringRule[] | { items: RecurringRule[] }>('/recurring').then(items) });
export function useRecurringMutations() {
  const inv = useInvalidateAll();
  return {
    create: useMutation({ mutationFn: (b: CreateRecurringInput) => api.post<RecurringRule>('/recurring', b), onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, ...b }: UpdateRecurringInput & { id: string }) => api.patch<RecurringRule>(`/recurring/${id}`, b), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/recurring/${id}`), onSuccess: inv }),
    run: useMutation({ mutationFn: (id?: string) => api.post<RecurringRunResponse>(id ? `/recurring/${id}/run` : '/recurring/run'), onSuccess: inv }),
  };
}

// ─── Project / audit ───────────────────────────────────────────────────────────
export function useProjectMutations() {
  const inv = useInvalidateAll();
  return { update: useMutation({ mutationFn: (b: UpdateProjectInput) => api.patch<ProjectResponse>('/project', b), onSuccess: inv }) };
}
export const useAudit = (params: Query) =>
  useQuery({ queryKey: ['audit', params], queryFn: () => api.get<Paginated<AuditLogEntry>>('/audit', params), placeholderData: keepPreviousData });
