import { useEffect, useState } from 'react';
import { CATEGORICAL_PALETTE, type CreatePaymentMethodInput, type PaymentMethod } from '@ledgr/shared';
import { usePaymentMethodMutations } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Toggle } from '@/components/ui/input';
import { ColorPicker } from './color-picker';

export function PaymentMethodForm({ open, onClose, method }: { open: boolean; onClose: () => void; method?: PaymentMethod | null }) {
  const toast = useToast();
  const { create, update } = usePaymentMethodMutations();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORICAL_PALETTE[0]);
  const [isDefault, setIsDefault] = useState(false);
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(method?.name ?? '');
    setColor(method?.color ?? CATEGORICAL_PALETTE[Math.floor(Math.random() * 7)]);
    setIsDefault(method?.isDefault ?? false);
    setArchived(method?.archived ?? false);
  }, [open, method]);
  const valid = name.trim().length > 0;
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    const body: CreatePaymentMethodInput = { name: name.trim(), color, isDefault, archived };
    try {
      if (method) await update.mutateAsync({ id: method.id, ...body });
      else await create.mutateAsync(body);
      toast.success(method ? 'Payment method updated' : 'Payment method added');
      onClose();
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={method ? 'Edit payment method' : 'New payment method'} footer={<><Button variant="ghost" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!valid}>{method ? 'Save' : 'Add'}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Cash, Visa, Instapay, PayPal…" /></Field>
        <ColorPicker value={color} onChange={setColor} />
        <Toggle checked={isDefault} onChange={setIsDefault} label="Default for new revenue" description="Preselected in the revenue form. Only one method can be the default." />
        {method && <Toggle checked={!archived} onChange={(v) => setArchived(!v)} label="Active" description={archived ? 'Archived: hidden from forms, history kept' : 'Shown in forms, filters and exports'} />}
      </form>
    </Modal>
  );
}
