import { useEffect, useState } from 'react';
import { POOL_ID, todayISO, type CreateSettlementInput, type Settlement, type SuggestedTransfer } from '@atyaio/ledgr-shared';
import { useSettlementMutations, useStakeholders } from '@/lib/queries';
import { useI18n } from '@/i18n';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { MoneyInput } from './money-input';

export function SettlementForm({ open, onClose, settlement, prefill }: { open: boolean; onClose: () => void; settlement?: Settlement | null; prefill?: SuggestedTransfer | null }) {
  const { t, name } = useI18n();
  const toast = useToast();
  const sh = useStakeholders();
  const { create, update } = useSettlementMutations();
  const [date, setDate] = useState(todayISO());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setDate(settlement?.date ?? todayISO());
    setFrom(settlement?.fromStakeholderId ?? (prefill?.fromStakeholderId !== POOL_ID ? prefill?.fromStakeholderId ?? '' : ''));
    setTo(settlement?.toStakeholderId ?? (prefill?.toStakeholderId === POOL_ID ? '' : prefill?.toStakeholderId ?? ''));
    setAmount(settlement?.amountMinor ?? prefill?.amountMinor ?? null);
    setNote(settlement?.note ?? '');
  }, [open, settlement, prefill]);

  const valid = !!date && !!from && amount !== null && amount > 0 && from !== to;
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    const body: CreateSettlementInput = { date, fromStakeholderId: from, toStakeholderId: to || null, amountMinor: amount!, note: note.trim() || null };
    try {
      if (settlement) await update.mutateAsync({ id: settlement.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t('Settlement recorded'));
      onClose();
    } catch (e) {
      toast.error(t('Could not save settlement'), errorMessage(e));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={settlement ? t('Edit settlement') : t('Record settlement')} description={t('A payment between partners (or into the company pool) that reduces what someone owes.')}
      footer={<><Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">{t('Cancel')}</Button><Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{settlement ? t('Save') : t('Record settlement')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <Field label={t('Amount')} required><MoneyInput large value={amount} onChange={setAmount} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('From (payer)')} required>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="" disabled>{t('Select…')}</option>
              {sh.data?.items.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
            </Select>
          </Field>
          <Field label={t('To (receiver)')}>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">{t('Company pool')}</option>
              {sh.data?.items.filter((s) => s.id !== from).map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('Date')} required><Input mono type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('Note')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Bank transfer ref, cash, …')} /></Field>
      </form>
    </Sheet>
  );
}
