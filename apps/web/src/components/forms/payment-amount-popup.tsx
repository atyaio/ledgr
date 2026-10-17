import { useEffect, useState } from 'react';
import type { Expense, PaymentMethod, Revenue } from '@ledgr/shared';
import { useExpenseMutations, useRevenueMutations } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { MoneyInput } from './money-input';

export type PaymentTarget = { kind: 'revenue'; entry: Revenue; method: PaymentMethod } | { kind: 'expense'; entry: Expense; method: PaymentMethod };

/** "Add Visa amount": set one payment method's amount on an existing expense or revenue entry. */
export function PaymentAmountPopup({ target, onClose }: { target: PaymentTarget | null; onClose: () => void }) {
  const { money } = useProject();
  const revenue = useRevenueMutations();
  const expenses = useExpenseMutations();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const existing = target?.entry.payments.find((p) => p.paymentMethodId === target.method.id)?.amountMinor ?? null;
  useEffect(() => setAmount(existing), [existing, target]);
  if (!target) return null;
  const { entry, method } = target;
  const mutation = target.kind === 'revenue' ? revenue.setPayment : expenses.setPayment;
  const othersTotal = entry.payments.filter((p) => p.paymentMethodId !== method.id).reduce((a, p) => a + p.amountMinor, 0);
  const newTotal = othersTotal + (amount ?? 0);
  const save = async () => {
    try {
      await mutation.mutateAsync({ id: entry.id, paymentMethodId: method.id, amountMinor: amount ?? 0 });
      toast.success(amount ? `${method.name} amount saved` : `${method.name} amount removed`);
      onClose();
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${existing ? 'Edit' : 'Add'} ${method.name} amount`}
      description={entry.description}
      footer={
        <>
          {existing !== null && <Button variant="danger" size="md" onClick={() => setAmount(0)} disabled={amount === 0}>Clear</Button>}
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={save} loading={mutation.isPending} disabled={amount === null || amount < 0 || newTotal <= 0}>Save</Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label={`${method.name} amount`}><MoneyInput large value={amount} onChange={setAmount} autoFocus /></Field>
        <div className="flex items-center justify-between text-[13px] text-ink-3"><span>New total</span><span className="num font-semibold text-ink">{money(newTotal)}</span></div>
      </form>
    </Modal>
  );
}
