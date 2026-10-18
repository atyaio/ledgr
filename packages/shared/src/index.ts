export * from './types';
export * from './schemas';
export * from './money';
export * from './split';
export * from './balances';
export * from './dates';
export * from './custom-fields';
export * from './csv';
export * from './colors';
export const LEDGR_VERSION = '0.1.0';

export type Lang = 'en' | 'ar';
/** Pick the localised name of a configurable record, falling back to English. */
export function localName(obj: { name: string; nameAr?: string | null } | null | undefined, lang: Lang): string {
  if (!obj) return '';
  return lang === 'ar' && obj.nameAr ? obj.nameAr : obj.name;
}
export function localLabel(obj: { label: string; labelAr?: string | null }, lang: Lang): string {
  return lang === 'ar' && obj.labelAr ? obj.labelAr : obj.label;
}
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Salaries', 'Software & subscriptions', 'Hosting & infrastructure', 'Marketing', 'Office & rent',
  'Equipment', 'Travel', 'Legal & accounting', 'Fees & taxes', 'Other',
];
export const DEFAULT_REVENUE_CATEGORIES = ['Sales', 'Services', 'Subscriptions', 'Consulting', 'Other'];
export * from './pos';
