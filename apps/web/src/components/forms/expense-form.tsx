import { useEffect, useState, type ReactNode } from 'react';
import { todayISO, type CreateExpenseInput, type CustomFields, type Expense, type SplitMode } from '@ledgr/shared';
import { useCategories, useExpenseMutations, useStakeholders } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { CustomFieldInputs } from './custom-field-inputs';
import { SplitEditor, type CustomSplit } from './split-editor';
import { ApiRequestError } from '@/lib/api';

export function ExpenseForm({ open, onClose, expense, defaults, switcher, onSaved }: { open: boolean; onClose: () => void; expense?: Expense | null; defaults?: Partial<CreateExpenseInput>; switcher?: ReactNode; onSaved?: () => void }) {
  const toast = useToast();
  const { create, update } = useExpenseMutations();
  const cats = useCategories('expense');
  const sh = useStakeholders();
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number | null>(null);
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
      setAmount(expense.amountMinor);
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

  const busy = create.isPending || update.isPending;
  const valid = !!date && amount !== null && amount > 0 && description.trim().length > 0 && !!categoryId;

  const submit = async () => {
    const body: CreateExpenseInput = {
      date,
      amountMinor: amount!,
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
      toast.success(expense ? 'Expense updated' : 'Expense added');
      onSaved ? onSaved() : onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CUSTOM_FIELDS' && Array.isArray(e.details)) {
        setCfErrors(Object.fromEntries((e.details as { key: string; message: string }[]).map((i) => [i.key, i.message])));
      }
      toast.error('Could not save expense', errorMessage(e));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'New expense'}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">Cancel</Button>
          <Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{expense ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {switcher && !expense && <div>{switcher}</div>}
        <Field label="Amount" required><MoneyInput large value={amount} onChange={setAmount} autoFocus={!expense} /></Field>
        <Field label="What for" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Hosting, payroll, flight tickets" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" required>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="" disabled>Select…</option>
              {cats.data?.items.filter((c) => !c.archived || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" required><Input mono type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <Field label="Paid by">
          <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            <option value="">Company account</option>
            {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <SplitEditor stakeholders={sh.data?.items ?? []} amountMinor={amount} mode={splitMode} onMode={setSplitMode} splits={splits} onSplits={setSplits} />
        <button type="button" className="text-[13.5px] font-medium text-accent" onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? 'Hide' : 'Add'} vendor & notes
        </button>
        {moreOpen && (
          <div className="space-y-4">
            <Field label="Vendor"><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
          </div>
        )}
        <CustomFieldInputs entity="expense" values={custom} onChange={setCustom} errors={cfErrors} />
      </form>
    </Sheet>
  );
}
