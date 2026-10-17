import { useEffect, useState } from 'react';
import { CUSTOM_FIELD_TYPES, slugifyKey, type CreateCustomFieldInput, type CustomFieldDefinition, type CustomFieldEntity, type CustomFieldType } from '@ledgr/shared';
import { useCustomFieldMutations } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';

const TYPE_LABEL: Record<CustomFieldType, string> = { text: 'Text', number: 'Number', money: 'Money', date: 'Date', boolean: 'Yes / no', select: 'Select (options)' };

export function CustomFieldForm({ open, onClose, field, entity }: { open: boolean; onClose: () => void; field?: CustomFieldDefinition | null; entity: CustomFieldEntity }) {
  const toast = useToast();
  const { create, update } = useCustomFieldMutations();
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? '');
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
      if (field) await update.mutateAsync({ id: field.id, label: label.trim(), type, options: opts, required });
      else { const body: CreateCustomFieldInput = { entity, key, label: label.trim(), type, options: opts, required }; await create.mutateAsync(body); }
      toast.success(field ? 'Field updated' : 'Field added');
      onClose();
    } catch (e) { toast.error('Could not save field', errorMessage(e)); }
  };
  return (
    <Modal open={open} onClose={onClose} title={field ? 'Edit custom field' : `New ${entity} field`} footer={<><Button variant="ghost" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!valid}>{field ? 'Save' : 'Add field'}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label" required><Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="Invoice no." /></Field>
          <Field label="Key" hint="CSV column id"><Input mono value={key} disabled={!!field} onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} /></Field>
        </div>
        <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>{CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
        {type === 'select' && <Field label="Options" hint="one per line"><Textarea value={options} onChange={(e) => setOptions(e.target.value)} placeholder={'Direct\nUpwork\nReferral'} /></Field>}
        <Checkbox label="Required" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {field && field.type !== type && <p className="text-[11.5px] text-warning">Changing the type does not convert existing values; incompatible ones are shown as blank.</p>}
      </form>
    </Modal>
  );
}
