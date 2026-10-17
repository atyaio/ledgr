import { useEffect, useState } from 'react';
import type { PaymentMethod, Revenue } from '@ledgr/shared';
import { useRevenueMutations } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { MoneyInput } from './money-input';

/** "Add Visa amount": set one payment method's amount on an existing revenue entry. */
export function PaymentAmountPopup({ target, onClose }: { target: { revenue: Revenue; method: PaymentMethod } | null; onClose: () => void }) {
  const { money } = useProject();
  const { setPayment } = useRevenueMutations();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const existing = target?.revenue.payments.find((p) => p.paymentMethodId === target.method.id)?.amountMinor ?? null;
  useEffect(() => setAmount(existing), [existing, target]);
  if (!target) return <Modal open={false} onClose={onClose} title=""><span /></Modal>;
  const { revenue, method } = target;
  const othersTotal = revenue.payments.filter((p) => p.paymentMethodId !== method.id).reduce((a, p) => a + p.amountMinor, 0);
  const newTotal = othersTotal + (amount ?? 0);
  const save = async () => {
    try {
      await setPayment.mutateAsync({ id: revenue.id, paymentMethodId: method.id, amountMinor: amount ?? 0 });
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
      description={revenue.description}
      footer={
        <>
          {existing !== null && <Button variant="danger" size="md" onClick={() => { setAmount(0); }} disabled={amount === 0}>Clear</Button>}
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={save} loading={setPayment.isPending} disabled={amount === null || amount < 0 || newTotal <= 0}>Save</Button>
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
