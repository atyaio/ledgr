import { useEffect, useState, type ReactNode } from 'react';
import { todayISO, type CreateRevenueInput, type CustomFields, type Revenue } from '@ledgr/shared';
import { useCategories, useRevenueMutations, useStakeholders } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { CustomFieldInputs } from './custom-field-inputs';
import { ApiRequestError } from '@/lib/api';

export function RevenueForm({ open, onClose, revenue, switcher, onSaved }: { open: boolean; onClose: () => void; revenue?: Revenue | null; switcher?: ReactNode; onSaved?: () => void }) {
  const toast = useToast();
  const { create, update } = useRevenueMutations();
  const cats = useCategories('revenue');
  const sh = useStakeholders();
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [custom, setCustom] = useState<CustomFields>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCfErrors({});
    setDate(revenue?.date ?? todayISO());
    setAmount(revenue?.amountMinor ?? null);
    setDescription(revenue?.description ?? '');
    setCategoryId(revenue?.categoryId ?? '');
    setReceivedBy(revenue?.receivedByStakeholderId ?? '');
    setSource(revenue?.source ?? '');
    setNotes(revenue?.notes ?? '');
    setCustom(revenue?.customFields ?? {});
    setMoreOpen(!!(revenue?.source || revenue?.notes));
  }, [open, revenue]);

  useEffect(() => {
    if (!open || revenue || categoryId) return;
    const def = cats.data?.items.find((c) => c.isDefault && !c.archived);
    if (def) setCategoryId(def.id);
  }, [open, revenue, categoryId, cats.data]);

  const busy = create.isPending || update.isPending;
  const valid = !!date && amount !== null && amount > 0 && description.trim().length > 0;

  const submit = async () => {
    const body: CreateRevenueInput = {
      date,
      amountMinor: amount!,
      description: description.trim(),
      categoryId: categoryId || null,
      receivedByStakeholderId: receivedBy || null,
      source: source.trim() || null,
      notes: notes.trim() || null,
      customFields: custom,
    };
    try {
      if (revenue) await update.mutateAsync({ id: revenue.id, ...body });
      else await create.mutateAsync(body);
      toast.success(revenue ? 'Revenue updated' : 'Revenue added');
      onSaved ? onSaved() : onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CUSTOM_FIELDS' && Array.isArray(e.details)) {
        setCfErrors(Object.fromEntries((e.details as { key: string; message: string }[]).map((i) => [i.key, i.message])));
      }
      toast.error('Could not save revenue', errorMessage(e));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={revenue ? 'Edit revenue' : 'New revenue'}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">Cancel</Button>
          <Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{revenue ? 'Save changes' : 'Add revenue'}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        {switcher && !revenue && <div>{switcher}</div>}
        <Field label="Amount" required><MoneyInput large value={amount} onChange={setAmount} autoFocus={!revenue} /></Field>
        <Field label="Description" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Invoice, sale, payout…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {cats.data?.items.filter((c) => !c.archived || c.id === categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" required><Input mono type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        </div>
        <Field label="Received by">
          <Select value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}>
            <option value="">Company account</option>
            {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <button type="button" className="text-[13.5px] font-medium text-accent" onClick={() => setMoreOpen((o) => !o)}>
          {moreOpen ? 'Hide' : 'Add'} source & notes
        </button>
        {moreOpen && (
          <div className="space-y-4">
            <Field label="Source" hint="client, platform…"><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
          </div>
        )}
        <CustomFieldInputs entity="revenue" values={custom} onChange={setCustom} errors={cfErrors} />
      </form>
    </Sheet>
  );
}
