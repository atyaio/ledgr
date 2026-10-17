import { useEffect, useState } from 'react';
import { todayISO, type CategoryKind, type CreateRecurringInput, type CustomFields, type RecurringFrequency, type RecurringRule, type SplitMode } from '@ledgr/shared';
import { useCategories, useRecurringMutations, useStakeholders } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/input';
import { Segmented } from '@/components/ui/misc';
import { MoneyInput } from './money-input';
import { SplitEditor, type CustomSplit } from './split-editor';
import { CustomFieldInputs } from './custom-field-inputs';

const FREQ: { id: RecurringFrequency; label: string }[] = [
  { id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }, { id: 'quarterly', label: 'Quarterly' }, { id: 'yearly', label: 'Yearly' },
];

export function RecurringForm({ open, onClose, rule }: { open: boolean; onClose: () => void; rule?: RecurringRule | null }) {
  const toast = useToast();
  const { create, update } = useRecurringMutations();
  const sh = useStakeholders();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const cats = useCategories(kind);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [party, setParty] = useState('');
  const [vendorOrSource, setVendorOrSource] = useState('');
  const [notes, setNotes] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('ownership');
  const [splits, setSplits] = useState<CustomSplit[]>([]);
  const [custom, setCustom] = useState<CustomFields>({});

  useEffect(() => {
    if (!open) return;
    setKind(rule?.kind ?? 'expense');
    setName(rule?.name ?? '');
    setFrequency(rule?.frequency ?? 'monthly');
    setInterval(rule?.interval ?? 1);
    setStartDate(rule?.startDate ?? todayISO());
    setEndDate(rule?.endDate ?? '');
    setActive(rule?.active ?? true);
    setDescription(rule?.template.description ?? '');
    setAmount(rule?.template.amountMinor ?? null);
    setCategoryId(rule?.template.categoryId ?? '');
    setParty(rule?.template.partyStakeholderId ?? '');
    setVendorOrSource(rule?.template.vendorOrSource ?? '');
    setNotes(rule?.template.notes ?? '');
    setSplitMode(rule?.template.splitMode ?? 'ownership');
    setSplits(rule?.template.customSplits ?? []);
    setCustom(rule?.template.customFields ?? {});
  }, [open, rule]);

  const valid = name.trim() && description.trim() && amount !== null && amount > 0 && !!startDate && (kind === 'revenue' || !!categoryId) && interval >= 1;
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    const body: CreateRecurringInput = {
      kind, name: name.trim(), frequency, interval, startDate, endDate: endDate || null, active,
      template: { description: description.trim(), amountMinor: amount!, categoryId: categoryId || null, partyStakeholderId: party || null, vendorOrSource: vendorOrSource.trim() || null, notes: notes.trim() || null, splitMode, customSplits: splitMode === 'custom' ? splits : [], customFields: custom },
    };
    try {
      if (rule) { const { kind: _k, ...rest } = body; await update.mutateAsync({ id: rule.id, ...rest }); }
      else await create.mutateAsync(body);
      toast.success(rule ? 'Rule updated' : 'Recurring rule created');
      onClose();
    } catch (e) {
      toast.error('Could not save rule', errorMessage(e));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={rule ? 'Edit recurring rule' : 'New recurring rule'} description="Entries are generated automatically when they come due (checked hourly and on start)." width={520}
      footer={<><Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">Cancel</Button><Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{rule ? 'Save' : 'Create rule'}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {!rule && <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(''); }} items={[{ id: 'expense', label: 'Expense' }, { id: 'revenue', label: 'Revenue' }]} />}
        <Field label="Rule name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office rent" autoFocus={!rule} /></Field>
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Field label="Frequency"><Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>{FREQ.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select></Field>
          <Field label="Every" hint="n"><Input mono type="number" min={1} max={365} value={interval} onChange={(e) => setInterval(Math.max(1, Number(e.target.value) || 1))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First occurrence" required><Input mono type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Ends" hint="optional"><Input mono type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
        <Toggle checked={active} onChange={setActive} label="Active" description={active ? 'Generates entries when due' : 'Paused: nothing is generated'} />
        <div className="pt-4 mt-2 border-t border-line"><span className="label">Entry template</span></div>
        <Field label="Description" required><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Category" required={kind === 'expense'}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{kind === 'expense' ? 'Select…' : 'Uncategorised'}</option>
              {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'expense' ? 'Paid by' : 'Received by'}><Select value={party} onChange={(e) => setParty(e.target.value)}><option value="">Company pool</option>{sh.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label={kind === 'expense' ? 'Vendor' : 'Source'}><Input value={vendorOrSource} onChange={(e) => setVendorOrSource(e.target.value)} /></Field>
        </div>
        {kind === 'expense' && <SplitEditor stakeholders={sh.data?.items ?? []} amountMinor={amount} mode={splitMode} onMode={setSplitMode} splits={splits} onSplits={setSplits} />}
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <CustomFieldInputs entity={kind} values={custom} onChange={setCustom} />
      </form>
    </Sheet>
  );
}
