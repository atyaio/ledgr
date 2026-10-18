import type { CustomFieldDefinition, CustomFieldEntity, CustomFields, CustomFieldValue } from '@atyaio/ledgr-shared';
import { useCustomFields } from '@/lib/queries';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { useI18n } from '@/i18n';

export function CustomFieldInputs({ entity, values, onChange, errors }: { entity: CustomFieldEntity; values: CustomFields; onChange: (v: CustomFields) => void; errors?: Record<string, string> }) {
  const q = useCustomFields(entity);
  const { t } = useI18n();
  const defs = q.data?.items ?? [];
  if (!defs.length) return null;
  const set = (key: string, v: CustomFieldValue) => onChange({ ...values, [key]: v });
  return (
    <fieldset className="space-y-3 pt-4 mt-2 border-t border-line">
      <legend className="label pe-2">{t('Custom fields')}</legend>
      {defs.map((d) => (
        <CustomFieldInput key={d.id} def={d} value={values[d.key] ?? null} onChange={(v) => set(d.key, v)} error={errors?.[d.key]} />
      ))}
    </fieldset>
  );
}

export function CustomFieldInput({ def, value, onChange, error }: { def: CustomFieldDefinition; value: CustomFieldValue; onChange: (v: CustomFieldValue) => void; error?: string }) {
  const { label } = useI18n();
  const common = { label: label(def), required: def.required, error };
  switch (def.type) {
    case 'text':
      return (
        <Field {...common}>
          <Input value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)} />
        </Field>
      );
    case 'number':
      return (
        <Field {...common}>
          <Input mono type="number" step="any" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
      );
    case 'money':
      return (
        <Field {...common}>
          <MoneyInput value={typeof value === 'number' ? value : null} onChange={onChange} />
        </Field>
      );
    case 'date':
      return (
        <Field {...common}>
          <Input mono type="date" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)} />
        </Field>
      );
    case 'boolean':
      return (
        <div className="pt-1">
          <Checkbox label={label(def)} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {error && <span className="block text-[11.5px] text-critical mt-1">{error}</span>}
        </div>
      );
    case 'select':
      return (
        <Field {...common}>
          <Select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {def.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Field>
      );
  }
}
