import { useEffect, useState } from 'react';
import { CATEGORICAL_PALETTE, type CreateStakeholderInput, type CustomFields, type Stakeholder } from '@ledgr/shared';
import { useStakeholderMutations } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Toggle } from '@/components/ui/input';
import { CustomFieldInputs } from './custom-field-inputs';
import { ColorPicker } from './color-picker';
import { ApiRequestError } from '@/lib/api';

export function StakeholderForm({ open, onClose, stakeholder, suggestedShare }: { open: boolean; onClose: () => void; stakeholder?: Stakeholder | null; suggestedShare?: number }) {
  const toast = useToast();
  const { create, update } = useStakeholderMutations();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [share, setShare] = useState('0');
  const [active, setActive] = useState(true);
  const [joinedAt, setJoinedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<string>(CATEGORICAL_PALETTE[0]);
  const [custom, setCustom] = useState<CustomFields>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setCfErrors({});
    setName(stakeholder?.name ?? '');
    setEmail(stakeholder?.email ?? '');
    setShare(String(stakeholder?.sharePercent ?? suggestedShare ?? 0));
    setActive(stakeholder?.active ?? true);
    setJoinedAt(stakeholder?.joinedAt ?? '');
    setNotes(stakeholder?.notes ?? '');
    setColor(stakeholder?.color ?? CATEGORICAL_PALETTE[0]);
    setCustom(stakeholder?.customFields ?? {});
  }, [open, stakeholder, suggestedShare]);

  const pct = Number(share);
  const valid = name.trim().length > 0 && Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    const body: CreateStakeholderInput = { name: name.trim(), email: email.trim() || null, sharePercent: pct, active, joinedAt: joinedAt || null, notes: notes.trim() || null, color, customFields: custom };
    try {
      if (stakeholder) await update.mutateAsync({ id: stakeholder.id, ...body });
      else await create.mutateAsync(body);
      toast.success(stakeholder ? 'Stakeholder updated' : 'Stakeholder added');
      onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CUSTOM_FIELDS' && Array.isArray(e.details)) setCfErrors(Object.fromEntries((e.details as { key: string; message: string }[]).map((i) => [i.key, i.message])));
      toast.error('Could not save', errorMessage(e));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={stakeholder ? 'Edit stakeholder' : 'New stakeholder'} description="Ownership share drives default expense splits and profit distribution."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={busy} disabled={!valid}>{stakeholder ? 'Save changes' : 'Add stakeholder'}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!stakeholder} /></Field>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ownership share" required hint="%"><Input mono type="number" step="0.01" min={0} max={100} value={share} onChange={(e) => setShare(e.target.value)} /></Field>
          <Field label="Joined"><Input mono type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} /></Field>
        </div>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" /></Field>
        <Toggle checked={active} onChange={setActive} label={active ? 'Active — included in ownership splits' : 'Inactive — excluded from new splits'} />
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
        <CustomFieldInputs entity="stakeholder" values={custom} onChange={setCustom} errors={cfErrors} />
      </form>
    </Sheet>
  );
}
