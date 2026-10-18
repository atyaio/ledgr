import type { CustomFieldDefinition, CustomFieldValue } from '@atyaio/ledgr-shared';
import { useProject } from '@/lib/project';
import { useI18n } from '@/i18n';

export function CustomCell({ def, value }: { def: CustomFieldDefinition; value: CustomFieldValue | undefined }) {
  const { t } = useI18n();
  const { money, date } = useProject();
  if (value === null || value === undefined || value === '') return <span className="text-ink-4">—</span>;
  switch (def.type) {
    case 'money':
      return <span className="num">{money(Number(value))}</span>;
    case 'number':
      return <span className="num">{Number(value).toLocaleString()}</span>;
    case 'date':
      return <span className="num text-ink-2">{date(String(value))}</span>;
    case 'boolean':
      return <span className={value ? 'text-good' : 'text-ink-3'}>{value ? t('Yes') : t('No')}</span>;
    case 'select':
      return <span className="inline-flex h-6 items-center px-2 rounded-full bg-sunken text-[12px]">{String(value)}</span>;
    default:
      return <span className="text-ink-2 truncate inline-block max-w-[200px] align-middle">{String(value)}</span>;
  }
}
