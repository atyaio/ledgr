import type { CustomFieldDefinition, CustomFieldValue, CustomFields } from './types';
import { parseMoney } from './money';

export interface CustomFieldIssue {
  key: string;
  message: string;
}

/**
 * Coerce + validate custom field values against definitions. Unknown keys are
 * dropped, archived definitions are ignored, missing optional fields become null.
 */
export function normalizeCustomFields(
  input: CustomFields | undefined,
  defs: Pick<CustomFieldDefinition, 'key' | 'type' | 'required' | 'options' | 'archived' | 'label'>[],
  currency: string,
): { values: CustomFields; issues: CustomFieldIssue[] } {
  const values: CustomFields = {};
  const issues: CustomFieldIssue[] = [];
  for (const def of defs) {
    if (def.archived) continue;
    const raw = input?.[def.key];
    const coerced = coerceValue(raw, def, currency);
    if (coerced.error) issues.push({ key: def.key, message: coerced.error });
    if (coerced.value === null && def.required) issues.push({ key: def.key, message: `${def.label} is required` });
    values[def.key] = coerced.value;
  }
  return { values, issues };
}

export function coerceValue(
  raw: CustomFieldValue | undefined,
  def: Pick<CustomFieldDefinition, 'type' | 'options' | 'label'>,
  currency: string,
): { value: CustomFieldValue; error?: string } {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  switch (def.type) {
    case 'text':
      return { value: String(raw) };
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      return Number.isFinite(n) ? { value: n } : { value: null, error: `${def.label} must be a number` };
    }
    case 'money': {
      if (typeof raw === 'number') return { value: Math.round(raw) };
      const n = parseMoney(String(raw), currency);
      return n === null ? { value: null, error: `${def.label} must be an amount` } : { value: n };
    }
    case 'date': {
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return { value: s };
      return { value: null, error: `${def.label} must be YYYY-MM-DD` };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      const s = String(raw).trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'x', '✓'].includes(s)) return { value: true };
      if (['false', 'no', 'n', '0', ''].includes(s)) return { value: false };
      return { value: null, error: `${def.label} must be yes/no` };
    }
    case 'select': {
      const s = String(raw).trim();
      const match = def.options.find((o) => o.toLowerCase() === s.toLowerCase());
      return match ? { value: match } : { value: null, error: `${def.label} must be one of: ${def.options.join(', ')}` };
    }
  }
}

/** Render a custom field value as a CSV cell. Money → decimal string. */
export function customFieldToCell(value: CustomFieldValue, type: CustomFieldDefinition['type'], currency: string, minorToDecimal: (m: number, c: string) => string): string {
  if (value === null || value === undefined) return '';
  if (type === 'money' && typeof value === 'number') return minorToDecimal(value, currency);
  if (type === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

export function slugifyKey(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '');
  return (s || 'field').slice(0, 40);
}
