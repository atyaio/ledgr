import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { todayISO, type CreateRevenueInput, type CustomFields, type PaymentMethod, type Revenue } from '@ledgr/shared';
import { useCategories, usePaymentMethods, useRevenueMutations, useStakeholders } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Swatch } from '@/components/ui/badge';
import { MoneyInput } from './money-input';
import { CustomFieldInputs } from './custom-field-inputs';
import { ApiRequestError } from '@/lib/api';

/**
 * Revenue form. With payment methods set up, the default method's amount is the main
 * field and the other methods can be filled in optionally; the total is their sum.
 * Without payment methods it is a plain amount.
 */
export function RevenueForm({ open, onClose, revenue, switcher, onSaved }: { open: boolean; onClose: () => void; revenue?: Revenue | null; switcher?: ReactNode; onSaved?: () => void }) {
  const toast = useToast();
  const { money } = useProject();
  const { create, update } = useRevenueMutations();
  const cats = useCategories('revenue');
  const sh = useStakeholders();
  const pm = usePaymentMethods(true);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number | null>(null); // used when there are no payment methods
  const [amounts, setAmounts] = useState<Record<string, number | null>>({}); // per payment method
  const [showOthers, setShowOthers] = useState(false);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [custom, setCustom] = useState<CustomFields>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  const methods: PaymentMethod[] = useMemo(() => {
    const all = pm.data?.items ?? [];
    const usedIds = new Set(revenue?.payments.map((p) => p.paymentMethodId) ?? []);
    return all.filter((m) => !m.archived || usedIds.has(m.id));
  }, [pm.data, revenue]);
  const primary = useMemo(() => methods.find((m) => m.isDefault) ?? methods[0], [methods]);
  const others = useMemo(() => methods.filter((m) => m.id !== primary?.id), [methods, primary]);
  const hasMethods = methods.length > 0;

  useEffect(() => {
    if (!open) return;
    setCfErrors({});
    setDate(revenue?.date ?? todayISO());
    setDescription(revenue?.description ?? '');
    setCategoryId(revenue?.categoryId ?? '');
    setReceivedBy(revenue?.receivedByStakeholderId ?? '');
    setSource(revenue?.source ?? '');
    setNotes(revenue?.notes ?? '');
    setCustom(revenue?.customFields ?? {});
    setMoreOpen(!!(revenue?.source || revenue?.notes));
    const map: Record<string, number | null> = {};
    for (const p of revenue?.payments ?? []) map[p.paymentMethodId] = p.amountMinor;
    setAmounts(map);
    setAmount(revenue && revenue.payments.length === 0 ? revenue.amountMinor : null);
    setShowOthers((revenue?.payments.filter((p) => p.amountMinor > 0).length ?? 0) > 1);
  }, [open, revenue]);

  useEffect(() => {
    if (!open || revenue || categoryId) return;
    const def = cats.data?.items.find((c) => c.isDefault && !c.archived);
    if (def) setCategoryId(def.id);
  }, [open, revenue, categoryId, cats.data]);

  const total = hasMethods ? methods.reduce((a, m) => a + (amounts[m.id] ?? 0), 0) : (amount ?? 0);
  const busy = create.isPending || update.isPending;
  const valid = !!date && total > 0 && description.trim().length > 0;

  const submit = async () => {
    const payments = hasMethods ? methods.map((m) => ({ paymentMethodId: m.id, amountMinor: amounts[m.id] ?? 0 })).filter((p) => p.amountMinor > 0) : undefined;
    const body: CreateRevenueInput = {
      date,
      amountMinor: total,
      payments,
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
        {hasMethods && primary ? (
          <>
            <Field label={<span className="inline-flex items-center gap-1.5"><Swatch color={primary.color} />{primary.name} amount</span>} required hint={primary.isDefault ? 'default method' : undefined}>
              <MoneyInput large value={amounts[primary.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [primary.id]: v }))} autoFocus={!revenue} />
            </Field>
            {others.length > 0 && !showOthers && (
              <button type="button" className="text-[13.5px] font-medium text-accent" onClick={() => setShowOthers(true)}>
                + Add {others.map((m) => m.name).join(' / ')} amounts
              </button>
            )}
            {others.length > 0 && showOthers && (
              <div className="rounded-[14px] border border-line divide-y divide-line">
                {others.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-2 w-32 shrink-0 text-[14px]"><Swatch color={m.color} />{m.name}</span>
                    <MoneyInput value={amounts[m.id] ?? null} onChange={(v) => setAmounts((a) => ({ ...a, [m.id]: v }))} placeholder="0.00" className="h-10" />
                  </label>
                ))}
                <div className="flex items-center justify-between px-3.5 h-10 text-[13px]">
                  <span className="text-ink-3">Total</span>
                  <span className="num font-semibold">{money(total)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <Field label="Amount" required><MoneyInput large value={amount} onChange={setAmount} autoFocus={!revenue} /></Field>
        )}
        <Field label="Description" required><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Invoice, sale, day's takings…" /></Field>
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
