import { useEffect, useState } from 'react';
import { CUSTOM_FIELD_TYPES, slugifyKey, type CreateCustomFieldInput, type CustomFieldDefinition, type CustomFieldEntity, type CustomFieldType } from '@atyaio/ledgr-shared';
import { useCustomFieldMutations } from '@/lib/queries';
import { useI18n } from '@/i18n';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';

const TYPE_LABEL: Record<CustomFieldType, string> = { text: 'Text', number: 'Number', money: 'Money', date: 'Date', boolean: 'Yes / no', select: 'Select (options)' };
const NEW_TITLE: Record<CustomFieldEntity, string> = { expense: 'New expense field', revenue: 'New revenue field', stakeholder: 'New stakeholder field' };

export function CustomFieldForm({ open, onClose, field, entity }: { open: boolean; onClose: () => void; field?: CustomFieldDefinition | null; entity: CustomFieldEntity }) {
  const toast = useToast();
  const { t } = useI18n();
  const { create, update } = useCustomFieldMutations();
  const [label, setLabel] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? '');
    setLabelAr(field?.labelAr ?? '');
    setKey(field?.key ?? '');
    setKeyTouched(!!field);
    setType(field?.type ?? 'text');
    setOptions(field?.options.join('\n') ?? '');
    setRequired(field?.required ?? false);
  }, [open, field]);
  useEffect(() => { if (!keyTouched) setKey(slugifyKey(label)); }, [label, keyTouched]);
  const opts = options.split('\n').map((s) => s.trim()).filter(Boolean);
  const valid = label.trim() && /^[a-z][a-z0-9_]*$/.test(key) && (type !== 'select' || opts.length > 0);
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    try {
      if (field) await update.mutateAsync({ id: field.id, label: label.trim(), labelAr: labelAr.trim() || null, type, options: opts, required });
      else { const body: CreateCustomFieldInput = { entity, key, label: label.trim(), labelAr: labelAr.trim() || null, type, options: opts, required }; await create.mutateAsync(body); }
      toast.success(t(field ? 'Field updated' : 'Field added'));
      onClose();
    } catch (e) { toast.error(t('Could not save field'), errorMessage(e)); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t(field ? 'Edit custom field' : NEW_TITLE[entity])} footer={<><Button variant="ghost" size="md" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!valid}>{t(field ? 'Save' : 'Add field')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Label')} required><Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder={t('Invoice no.')} /></Field>
          <Field label={t('Key')} hint={t('CSV column id')}><Input mono value={key} disabled={!!field} onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} /></Field>
        </div>
        <Field label={t('Arabic label')} hint={t('optional')}><Input lang="ar" dir="rtl" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} /></Field>
        <Field label={t('Type')}><Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>{CUSTOM_FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(TYPE_LABEL[ty])}</option>)}</Select></Field>
        {type === 'select' && <Field label={t('Options')} hint={t('one per line')}><Textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder={[t('Direct'), 'Upwork', t('Referral')].join('\n')} /></Field>}
        <Checkbox label={t('Required')} checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {field && field.type !== type && <p className="text-[11.5px] text-warning">{t('Changing the type does not convert existing values; incompatible ones are shown as blank.')}</p>}
      </form>
    </Modal>
  );
}
