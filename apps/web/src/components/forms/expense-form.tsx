import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { todayISO, type CreateExpenseInput, type CustomFields, type Expense, type PaymentMethod, type SplitMode } from '@ledgr/shared';
import { useCategories, useExpenseMutations, usePaymentMethods, useStakeholders } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { useI18n } from '@/i18n';
import { Swatch } from '@/components/ui/badge';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { CustomFieldInputs } from './custom-field-inputs';
import { SplitEditor, type CustomSplit } from './split-editor';
import { ApiRequestError } from '@/lib/api';

export function ExpenseForm({ open, onClose, expense, defaults, switcher, onSaved }: { open: boolean; onClose: () => void; expense?: Expense | null; defaults?: Partial<CreateExpenseInput>; switcher?: ReactNode; onSaved?: () => void }) {
  const { t, name } = useI18n();
  const toast = useToast();
  const { money } = useProject();
  const { create, update } = useExpenseMutations();
  const cats = useCategories('expense');
  const sh = useStakeholders();
  const pm = usePaymentMethods(true);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number | null>(null); // used when there are no payment methods
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [showOthers, setShowOthers] = useState(false);
  const methods: PaymentMethod[] = useMemo(() => {
    const all = pm.data?.items ?? [];
    const used = new Set(expense?.payments.map((p) => p.paymentMethodId) ?? []);
    return all.filter((m) => !m.archived || used.has(m.id));
  }, [pm.data, expense]);
  const primary = useMemo(() => methods.find((m) => m.isDefault) ?? methods[0], [methods]);
  const others = useMemo(() => methods.filter((m) => m.id !== primary?.id), [methods, primary]);
  const hasMethods = methods.length > 0;
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('ownership');
  const [splits, setSplits] = useState<CustomSplit[]>([]);
  const [custom, setCustom] = useState<CustomFields>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCfErrors({});
    if (expense) {
      setDate(expense.date);
      setAmount(expense.payments.length === 0 ? expense.amountMinor : null);
      const map: Record<string, number | null> = {};
      for (const p of expense.payments) map[p.paymentMethodId] = p.amountMinor;
      setAmounts(map);
      setShowOthers(expense.payments.filter((p) => p.amountMinor > 0).length > 1);
      setDescription(expense.description);
      setCategoryId(expense.categoryId);
      setPaidBy(expense.paidByStakeholderId ?? '');
      setVendor(expense.vendor ?? '');
      setNotes(expense.notes ?? '');
      setSplitMode(expense.splitMode);
      setSplits(expense.splits.map((s) => ({ stakeholderId: s.stakeholderId, sharePercent: s.sharePercent })));
      setCustom(expense.customFields ?? {});
      setMoreOpen(!!(expense.vendor || expense.notes));
    } else {
      setDate(defaults?.date ?? todayISO());
      setAmount(defaults?.amountMinor ?? null);
      setAmounts(defaults?.amountMinor && primary ? { [primary.id]: defaults.amountMinor } : {});
      setShowOthers(false);
      setDescription(defaults?.description ?? '');
      setCategoryId(defaults?.categoryId ?? '');
      setPaidBy(defaults?.paidByStakeholderId ?? '');
      setVendor(defaults?.vendor ?? '');
      setNotes('');
      setSplitMode('ownership');
      setSplits([]);
      setCustom({});
      setMoreOpen(false);
    }
  }, [open, expense, defaults]);

  useEffect(() => {
    if (!categoryId && cats.data?.items.length && !expense) {
      const live = cats.data.items.filter((c) => !c.archived);
      setCategoryId((live.find((c) => c.isDefault) ?? live[0])?.id ?? '');
    }
  }, [cats.data, categoryId, expense]);

  const total = hasMethods ? methods.reduce((a, m) => a + (amounts[m.id] ?? 0), 0) : (amount ?? 0);
  const busy = create.isPending || update.isPending;
  const valid = !!date && total > 0 && description.trim().length > 0 && !!categoryId;

  const submit = async () => {
    const payments = hasMethods ? methods.map((m) => ({ paymentMethodId: m.id, amountMinor: amounts[m.id] ?? 0 })).filter((p) => p.amountMinor > 0) : undefined;
    const body: CreateExpenseInput = {
      date,
      amountMinor: total,
      payments,
      description: description.trim(),
      categoryId,
      paidByStakeholderId: paidBy || null,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
      splitMode,
      customSplits: splitMode === 'custom' ? splits : undefined,
      customFields: custom,
    };
    try {
      if (expense) await update.mutateAsync({ id: expense.id, ...body });
      else await create.mutateAsync(body);
      toast.success(expense ? t('Expense updated') : t('Expense added'));
      onSaved ? onSaved() : onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CUSTOM_FIELDS' && Array.isArray(e.details)) {
        setCfErrors(Object.fromEntries((e.details as { key: string; message: string }[]).map((i) => [i.key, i.message])));
      }
      toast.error(t('Could not save expense'), errorMessage(e));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? t('Edit expense') : t('New expense')}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">{t('Cancel')}</Button>
          <Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{expense ? t('Save changes') : t('Add expense')}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {switcher && !expense && <div>{switcher}</div>}
        {hasMethods && primary ? (
          <>
            <Field label={<span className="inline-flex items-center gap-1.5"><Swatch color={primary.color} />{t('{method} amount', { method: name(primary) })}</span>} required hint={primary.isDefault ? t('default method') : undefined}>
              <MoneyInput large value={amounts[primary.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [primary.id]: v }))} autoFocus={!expense} />
            </Field>
            {others.length > 0 && !showOthers && (
              <button type="button" className="text-[13.5px] font-medium text-accent" onClick={() => setShowOthers(true)}>
                + {t('Add {methods} amounts', { methods: others.map((m) => name(m)).join(' / ') })}
              </button>
            )}
            {others.length > 0 && showOthers && (
              <div className="rounded-[14px] border border-line divide-y divide-line">
                {others.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-2 w-32 shrink-0 text-[14px]"><Swatch color={m.color} />{name(m)}</span>
                    <MoneyInput value={amounts[m.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [m.id]: v }))} placeholder="0.00" className="h-10" />
                  </label>
                ))}
                <div className="flex items-center justify-between px-3.5 h-10 text-[13px]">
                  <span className="text-ink-3">{t('Total')}</span>
                  <span className="num font-semibold">{money(total)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <Field label={t('Amount')} required><MoneyInput large value={amount} onChange={setAmount} autoFocus={!expense} /></Field>
        )}
        <Field label={t('What for')} required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('e.g. Hosting, payroll, flight tickets')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Category')} required>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="" disabled>{t('Select…')}</option>
              {cats.data?.items.filter((c) => !c.archived || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
            </Select>
          </Field>
          <Field label={t('Date')} required><Input mono type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <Field label={t('Paid by')}>
          <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            <option value="">{t('Company account')}</option>
            {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
          </Select>
        </Field>
        <SplitEditor stakeholders={sh.data?.items ?? []} amountMinor={total || null} mode={splitMode} onMode={setSplitMode} splits={splits} onSplits={setSplits} />
        <button type="button" className="text-[13.5px] font-medium text-accent" onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? t('Hide vendor & notes') : t('Add vendor & notes')}
        </button>
        {moreOpen && (
          <div className="space-y-4">
            <Field label={t('Vendor')}><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t('Optional')} /></Field>
            <Field label={t('Notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Optional')} /></Field>
          </div>
        )}
        <CustomFieldInputs entity="expense" values={custom} onChange={setCustom} errors={cfErrors} />
      </form>
    </Sheet>
  );
}
