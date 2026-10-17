import { useEffect, useState } from 'react';
import { CATEGORICAL_PALETTE, type CreateStakeholderInput, type CustomFields, type Stakeholder } from '@ledgr/shared';
import { useStakeholderMutations } from '@/lib/queries';
import { useI18n } from '@/i18n';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Toggle } from '@/components/ui/input';
import { CustomFieldInputs } from './custom-field-inputs';
import { ColorPicker } from './color-picker';
import { ApiRequestError } from '@/lib/api';

export function StakeholderForm({ open, onClose, stakeholder, suggestedShare }: { open: boolean; onClose: () => void; stakeholder?: Stakeholder | null; suggestedShare?: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const { create, update } = useStakeholderMutations();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
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
    setNameAr(stakeholder?.nameAr ?? '');
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
    const body: CreateStakeholderInput = { name: name.trim(), nameAr: nameAr.trim() || null, email: email.trim() || null, sharePercent: pct, active, joinedAt: joinedAt || null, notes: notes.trim() || null, color, customFields: custom };
    try {
      if (stakeholder) await update.mutateAsync({ id: stakeholder.id, ...body });
      else await create.mutateAsync(body);
      toast.success(stakeholder ? t('Stakeholder updated') : t('Stakeholder added'));
      onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CUSTOM_FIELDS' && Array.isArray(e.details)) setCfErrors(Object.fromEntries((e.details as { key: string; message: string }[]).map((i) => [i.key, i.message])));
      toast.error(t('Could not save'), errorMessage(e));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={stakeholder ? t('Edit stakeholder') : t('New stakeholder')} description={t('Ownership share drives default expense splits and profit distribution.')}
      footer={<><Button variant="ghost" size="md" onClick={onClose} className="max-md:hidden">{t('Cancel')}</Button><Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!valid} className="w-full md:w-auto">{stakeholder ? t('Save changes') : t('Add stakeholder')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label={t('Name')} required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!stakeholder} /></Field>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <Field label={t('Arabic name')} hint={t('optional')}><Input lang="ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Ownership share')} required hint="%"><Input mono type="number" step="0.01" min={0} max={100} value={share} onChange={(e) => setShare(e.target.value)} /></Field>
          <Field label={t('Joined')}><Input mono type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} /></Field>
        </div>
        <Field label={t('Email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('Optional')} /></Field>
        <Toggle checked={active} onChange={setActive} label={t('Active partner')} description={active ? t('Included in ownership splits and distribution') : t('Kept for history, excluded from new splits')} />
        <Field label={t('Notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Optional')} /></Field>
        <CustomFieldInputs entity="stakeholder" values={custom} onChange={setCustom} errors={cfErrors} />
      </form>
    </Sheet>
  );
}
